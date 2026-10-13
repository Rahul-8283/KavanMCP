"""Phase 4: GET /api/kills and POST /api/rollback, the backend of the Rollback Manager."""
import asyncio
import os
import subprocess
import sys

import psutil
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import db
from handlers import termination_handler
from handlers.approval_handler import PENDING_APPROVALS
from kill_helpers import EXISTING_EXE, add_kill, read_row, row_ids, unique_name
from ws_server import app

client = TestClient(app, base_url="http://127.0.0.1:8000")

KILLS = "/api/kills"
ROLLBACK = "/api/rollback"


def listed(**params) -> dict:
    response = client.get(KILLS, params=params)
    assert response.status_code == 200, response.text
    return response.json()


def kill_in_list(audit_id: str, **params) -> dict | None:
    return next((kill for kill in listed(**params)["kills"] if kill["id"] == audit_id), None)


def restore(audit_id: str):
    return client.post(ROLLBACK, json={"id": audit_id})


def code(response) -> str:
    return response.json()["detail"]["code"]


# --- The tier and the audit id, from a real kill (sections 3.1 and 3.2) ---

def test_a_kill_through_the_api_stores_the_tier_the_user_confirmed():
    child = subprocess.Popen([sys._base_executable, "-c", "import time; time.sleep(120)"],
                             creationflags=subprocess.CREATE_NO_WINDOW)
    try:
        confirm = client.post("/api/confirm_termination", json={"pid": child.pid})
        assert confirm.status_code == 200
        execute = client.post("/api/execute_termination", json={"pid": child.pid})
        assert execute.status_code == 200
        child.wait(timeout=10)

        body = execute.json()
        row = read_row(body["audit_id"])

        assert row["action_type"] == "TERMINATED"
        assert row["pid"] == child.pid
        assert row["tier"] == confirm.json()["tier"]
        assert row["rolled_back_at"] is None
        # The id in the response is the id the list offers for the undo
        listed_kill = kill_in_list(body["audit_id"])
        assert listed_kill["tier"] == confirm.json()["tier"]
        assert listed_kill["can_restore"] is True
    finally:
        PENDING_APPROVALS.clear()
        if child.poll() is None:
            psutil.Process(child.pid).kill()


def test_a_kill_made_without_a_tier_lists_it_as_unknown():
    audit_id = add_kill(tier=None)

    assert kill_in_list(audit_id)["tier"] is None


# --- Listing kills (section 5.1) ---

def test_the_list_carries_everything_the_page_shows():
    audit_id = add_kill(name="Discord.exe", path=EXISTING_EXE, tier=3)

    kill = kill_in_list(audit_id)

    assert kill["name"] == "Discord.exe"
    assert kill["pid"] == 1234
    assert kill["tier"] == 3
    assert kill["memory_freed_mb"] == 10.0
    assert kill["cpu_freed_pct"] == 1.0
    assert kill["executable_path"] == EXISTING_EXE
    assert kill["reasoning"] == "test"
    assert kill["rolled_back_at"] is None
    assert kill["can_restore"] is True
    assert kill["restore_blocked_reason"] is None
    assert kill["killed_at"].endswith("Z")


def test_the_list_says_whether_the_backend_is_elevated():
    assert isinstance(listed()["backend_elevated"], bool)


def test_kills_are_listed_newest_first():
    first, second, third = add_kill(), add_kill(), add_kill()

    ids = [kill["id"] for kill in listed()["kills"]]

    assert [i for i in ids if i in (first, second, third)] == [third, second, first]


def test_only_kills_inside_the_window_are_listed():
    recent = add_kill(age_hours=2)
    old = add_kill(age_hours=30)

    assert kill_in_list(recent, hours=24) is not None
    assert kill_in_list(old, hours=24) is None
    assert kill_in_list(old, hours=48) is not None


def test_blocked_and_rollback_rows_are_not_listed(fake_popen):
    asyncio.run(db.log_blocked_action("lsass.exe", 600, "test"))
    restored = add_kill()
    assert restore(restored).status_code == 200

    ids = {kill["id"] for kill in listed()["kills"]}

    assert not ids & set(row_ids("BLOCKED"))
    assert not ids & set(row_ids("ROLLBACK"))


@pytest.mark.parametrize("hours", ["0", "169", "1000", "-1", "abc"])
def test_a_bad_window_is_a_400(hours):
    assert client.get(KILLS, params={"hours": hours}).status_code == 400


def test_the_shortest_and_longest_windows_are_accepted():
    assert client.get(KILLS, params={"hours": 1}).status_code == 200
    assert client.get(KILLS, params={"hours": 168}).status_code == 200


# --- What can be restored, and why not (section 5.1) ---

def test_a_kill_whose_executable_was_deleted_cannot_be_restored(tmp_path, fake_popen):
    exe = tmp_path / "gone.exe"
    exe.write_bytes(b"")
    audit_id = add_kill(path=str(exe))
    exe.unlink()

    kill = kill_in_list(audit_id)
    response = restore(audit_id)

    assert kill["can_restore"] is False
    assert kill["restore_blocked_reason"] == "exe_missing"
    assert response.status_code == 422
    assert code(response) == "exe_missing"
    assert read_row(audit_id)["rolled_back_at"] is None, "a refusal must not mark the kill as restored"
    fake_popen.assert_not_called()


def test_a_kill_recorded_without_a_path_cannot_be_restored(fake_popen):
    audit_id = add_kill(path=None)

    kill = kill_in_list(audit_id)
    response = restore(audit_id)

    assert kill["can_restore"] is False
    assert kill["restore_blocked_reason"] == "no_path"
    assert response.status_code == 422
    assert code(response) == "no_path"
    fake_popen.assert_not_called()


# --- Restoring one kill (sections 4 and 5.2) ---

def test_a_restore_starts_the_program_and_marks_the_kill(fake_popen):
    audit_id = add_kill(name="Discord.exe", argv=[EXISTING_EXE, "--profile", "work"])

    response = restore(audit_id)

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "success"
    assert body["id"] == audit_id
    assert body["name"] == "Discord.exe"
    assert body["new_pid"] == 4242
    assert body["rolled_back_at"].endswith("Z")
    fake_popen.assert_called_once()
    assert fake_popen.call_args.args[0] == [EXISTING_EXE, "--profile", "work"]
    assert read_row(audit_id)["rolled_back_at"] is not None
    # The list now shows it as restored
    kill = kill_in_list(audit_id)
    assert kill["can_restore"] is False
    assert kill["restore_blocked_reason"] == "already_restored"
    assert kill["rolled_back_at"] == body["rolled_back_at"]


def test_a_restore_writes_a_rollback_row(fake_popen):
    audit_id = add_kill(name="Discord.exe")
    before = len(row_ids("ROLLBACK"))

    restore(audit_id)

    assert len(row_ids("ROLLBACK")) == before + 1
    assert read_row(row_ids("ROLLBACK")[-1])["pid"] == 4242


def test_restoring_the_older_of_two_kills_uses_its_own_arguments(fake_popen):
    name = unique_name()
    older = add_kill(name=name, argv=[EXISTING_EXE, "--older"])
    newer = add_kill(name=name, argv=[EXISTING_EXE, "--newer"])

    assert restore(older).status_code == 200

    assert fake_popen.call_args.args[0] == [EXISTING_EXE, "--older"]
    assert read_row(older)["rolled_back_at"] is not None
    assert read_row(newer)["rolled_back_at"] is None


def test_the_same_kill_cannot_be_restored_twice(fake_popen):
    audit_id = add_kill()

    first = restore(audit_id)
    second = restore(audit_id)

    assert first.status_code == 200
    assert second.status_code == 409
    assert code(second) == "already_restored"
    assert fake_popen.call_count == 1


def test_two_restores_at_the_same_moment_start_one_program(fake_popen):
    audit_id = add_kill()

    async def both():
        return await asyncio.gather(termination_handler.rollback_by_id(audit_id),
                                    termination_handler.rollback_by_id(audit_id))

    results = asyncio.run(both())

    assert sorted(result["status"] for result in results) == ["already_restored", "success"]
    assert fake_popen.call_count == 1


def test_a_failed_launch_releases_the_kill_so_it_can_be_retried(fake_popen):
    audit_id = add_kill()
    fake_popen.side_effect = OSError("blocked by policy")

    failed = restore(audit_id)

    assert failed.status_code == 500
    assert code(failed) == "launch_failed"
    assert read_row(audit_id)["rolled_back_at"] is None
    assert kill_in_list(audit_id)["can_restore"] is True

    fake_popen.side_effect = None
    retried = restore(audit_id)

    assert retried.status_code == 200
    assert read_row(audit_id)["rolled_back_at"] is not None


def test_an_unknown_id_is_a_404(fake_popen):
    response = restore("00000000-0000-0000-0000-000000000000")

    assert response.status_code == 404
    assert code(response) == "not_found"
    fake_popen.assert_not_called()


def test_only_kills_can_be_restored(fake_popen):
    asyncio.run(db.log_blocked_action("lsass.exe", 600, "test"))
    blocked = row_ids("BLOCKED")[-1]
    restored = add_kill()
    restore(restored)
    rollback_row = row_ids("ROLLBACK")[-1]
    fake_popen.reset_mock()

    for audit_id in (blocked, rollback_row):
        response = restore(audit_id)
        assert response.status_code == 404
        assert code(response) == "not_found"
    fake_popen.assert_not_called()


@pytest.mark.parametrize("body", [{}, {"id": ""}, {"id": 5}, {"id": "x" * 65}, {"name": "Discord.exe"}])
def test_a_malformed_request_is_a_400_and_starts_nothing(body, fake_popen):
    assert client.post(ROLLBACK, json=body).status_code == 400
    fake_popen.assert_not_called()


def test_the_request_cannot_name_a_program_to_start(fake_popen):
    response = client.post(ROLLBACK, json={"id": add_kill(), "path": "C:/Windows/System32/calc.exe", "args": ["x"]})

    # Extra fields are ignored: only the recorded path and arguments are ever used
    assert response.status_code == 200
    assert fake_popen.call_args.args[0] == [EXISTING_EXE]


# --- Claude and the app agree (section 4.4) ---

def test_a_kill_restored_by_the_app_is_skipped_by_the_mcp_tool(fake_popen):
    from tools.rollback_tool import rollback_last_action_logic

    name = unique_name()
    older = add_kill(name=name, argv=[EXISTING_EXE, "--older"])
    newer = add_kill(name=name, argv=[EXISTING_EXE, "--newer"])
    assert restore(newer).status_code == 200
    fake_popen.reset_mock()

    result = asyncio.run(rollback_last_action_logic(name))

    assert '"success"' in result
    assert fake_popen.call_args.args[0] == [EXISTING_EXE, "--older"]
    assert read_row(older)["rolled_back_at"] is not None


# --- Who may call it ---

def test_both_routes_refuse_a_foreign_origin(fake_popen):
    audit_id = add_kill()
    evil = {"Origin": "https://evil.example"}

    listing = client.get(KILLS, headers=evil)
    rollback = client.post(ROLLBACK, json={"id": audit_id}, headers=evil)

    for response in (listing, rollback):
        assert response.status_code == 403
        assert response.json()["detail"]["code"] == "forbidden_origin"
    assert read_row(audit_id)["rolled_back_at"] is None
    fake_popen.assert_not_called()


def test_an_unreadable_database_is_an_error_not_an_empty_list(monkeypatch):
    monkeypatch.setattr(db, "DB_PATH", os.path.join(os.path.dirname(db.DB_PATH), "missing-dir", "x.db"))
    quiet = TestClient(app, base_url="http://127.0.0.1:8000", raise_server_exceptions=False)

    assert quiet.get(KILLS).status_code == 500
    assert quiet.post(ROLLBACK, json={"id": "abc"}).status_code == 500

