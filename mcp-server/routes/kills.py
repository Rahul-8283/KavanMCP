"""List what was killed and restore one kill. Attached to the dashboard app in ws_server.py."""
import os
from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from database.db import get_recent_kills
from handlers.termination_handler import rollback_by_id
from utils.privileges import is_admin
from utils.timefmt import to_iso_utc

router = APIRouter()

MAX_KILLS = 200

ROLLBACK_HTTP_STATUS = {
    "not_found": 404,
    "already_restored": 409,
    "no_path": 422,
    "exe_missing": 422,
    "launch_failed": 500,
    "error": 500,
}


class RollbackRequest(BaseModel):
    id: str = Field(min_length=1, max_length=64)


def restore_blocker(row: dict) -> str | None:
    """Why a kill cannot be restored right now, or None when it can."""
    if row["rolled_back_at"]:
        return "already_restored"
    path = row["executable_path"]
    if not path:
        return "no_path"
    if not os.path.exists(path):
        return "exe_missing"
    return None


def serialize_kill(row: dict) -> dict:
    """One TERMINATED audit row in the shape the API returns."""
    blocker = restore_blocker(row)
    return {
        "id": row["id"],
        "name": row["process_name"],
        "pid": row["pid"],
        "tier": row["tier"],
        "killed_at": to_iso_utc(row["timestamp"]),
        "memory_freed_mb": row["memory_freed_mb"],
        "cpu_freed_pct": row["cpu_freed_pct"],
        "executable_path": row["executable_path"],
        "reasoning": row["llm_reasoning"],
        "rolled_back_at": to_iso_utc(row["rolled_back_at"]) if row["rolled_back_at"] else None,
        "can_restore": blocker is None,
        "restore_blocked_reason": blocker,
    }


@router.get("/api/kills")
async def list_kills(hours: Annotated[int, Query(ge=1, le=168)] = 24):
    """Processes terminated in the last `hours` hours, newest first, with whether each can be restored."""
    rows = await get_recent_kills(hours, MAX_KILLS)
    return {"backend_elevated": is_admin(), "kills": [serialize_kill(row) for row in rows]}


@router.post("/api/rollback")
async def rollback(payload: RollbackRequest):
    """
    Starts a killed process again. The request names only the audit row: the program and its
    arguments are the ones Kavan recorded when it killed the process, so nothing else can be launched.
    """
    result = await rollback_by_id(payload.id)
    if result["status"] != "success":
        raise HTTPException(
            status_code=ROLLBACK_HTTP_STATUS.get(result["status"], 500),
            detail={"code": result["status"], "message": result["message"]},
        )
    return {
        "status": "success",
        "id": result["id"],
        "name": result["name"],
        "new_pid": result["new_pid"],
        "rolled_back_at": to_iso_utc(result["rolled_back_at"]) if result["rolled_back_at"] else None,
    }
