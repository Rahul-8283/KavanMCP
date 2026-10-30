"""Phase 6 §2: settings live outside git, and existing values move across once."""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import settings_manager


def _write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f)


def test_the_test_run_uses_a_temporary_settings_file():
    assert settings_manager.CONFIG_PATH != settings_manager.LEGACY_CONFIG_PATH
    assert "kavan-settings-" in settings_manager.CONFIG_PATH


def test_old_settings_file_is_copied_on_first_load(tmp_path, monkeypatch):
    legacy = tmp_path / "config" / "settings.json"
    current = tmp_path / "data" / "settings.json"
    _write(legacy, {"cpu_threshold": 64, "theme": "light", "sound_alerts": False, "junk": 1})
    monkeypatch.setattr(settings_manager, "LEGACY_CONFIG_PATH", str(legacy))
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(current))

    config = settings_manager.load_config()

    assert config["cpu_threshold"] == 64
    assert config["theme"] == "light"
    assert config["sound_alerts"] is False
    assert "junk" not in config
    assert json.loads(current.read_text(encoding="utf-8"))["cpu_threshold"] == 64
    assert legacy.exists(), "the old file is left in place, never deleted by the app"


def test_a_corrupt_old_file_gives_the_defaults(tmp_path, monkeypatch):
    legacy = tmp_path / "settings.json"
    legacy.write_text("{ not json", encoding="utf-8")
    monkeypatch.setattr(settings_manager, "LEGACY_CONFIG_PATH", str(legacy))
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(tmp_path / "data" / "settings.json"))

    assert settings_manager.load_config() == settings_manager.DEFAULT_CONFIG


def test_an_existing_new_file_wins_over_the_old_one(tmp_path, monkeypatch):
    legacy = tmp_path / "settings.json"
    current = tmp_path / "data" / "settings.json"
    _write(legacy, {"cpu_threshold": 10})
    _write(current, {"cpu_threshold": 55})
    monkeypatch.setattr(settings_manager, "LEGACY_CONFIG_PATH", str(legacy))
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(current))

    assert settings_manager.load_config()["cpu_threshold"] == 55


def test_no_file_at_all_writes_the_defaults(tmp_path, monkeypatch):
    current = tmp_path / "data" / "settings.json"
    monkeypatch.setattr(settings_manager, "LEGACY_CONFIG_PATH", str(tmp_path / "missing.json"))
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(current))

    assert settings_manager.load_config() == settings_manager.DEFAULT_CONFIG
    assert json.loads(current.read_text(encoding="utf-8")) == settings_manager.DEFAULT_CONFIG


def test_protected_lists_keep_only_clean_process_names():
    cleaned = settings_manager._valid_entries({"never_kill": [
        "  Notepad.EXE ", "notepad.exe", 42, "", "   ", r"C:\Windows\notepad.exe", "/usr/bin/x", "a:b",
        "x" * 261, "y" * 260, None, "Code.exe",
    ]})["never_kill"]

    assert cleaned == ["notepad.exe", "y" * 260, "code.exe"]


def test_a_protected_list_that_is_not_a_list_is_dropped():
    assert "never_alert" not in settings_manager._valid_entries({"never_alert": "obs64.exe"})


def test_a_long_protected_list_is_cut_to_200_names():
    names = [f"app{i}.exe" for i in range(300)]

    cleaned = settings_manager._valid_entries({"never_kill": names})["never_kill"]

    assert len(cleaned) == 200
    assert cleaned == names[:200]


def test_a_protected_list_replaces_the_stored_one_as_a_whole(tmp_path, monkeypatch):
    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(tmp_path / "data" / "settings.json"))
    monkeypatch.setattr(settings_manager, "ACTIVE_CONFIG", dict(settings_manager.DEFAULT_CONFIG))
    settings_manager.update_config({"never_kill": ["a.exe", "b.exe"]})

    settings_manager.update_config({"never_kill": ["c.exe"]})

    assert settings_manager.ACTIVE_CONFIG["never_kill"] == ["c.exe"]
    assert json.loads((tmp_path / "data" / "settings.json").read_text(encoding="utf-8"))["never_kill"] == ["c.exe"]


def test_the_settings_endpoint_saves_the_cleaned_lists(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from ws_server import app

    monkeypatch.setattr(settings_manager, "CONFIG_PATH", str(tmp_path / "data" / "settings.json"))
    monkeypatch.setattr(settings_manager, "ACTIVE_CONFIG", dict(settings_manager.DEFAULT_CONFIG))
    client = TestClient(app, base_url="http://127.0.0.1:8000")

    response = client.post("/api/update_thresholds", json={"never_kill": ["  Code.EXE ", "code.exe", "C:/x.exe"]})

    assert response.status_code == 200
    assert response.json()["config"]["never_kill"] == ["code.exe"]
