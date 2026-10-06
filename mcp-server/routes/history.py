"""Read-only routes over the history tables. Attached to the dashboard app in ws_server.py."""
import time
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query

from database.db import get_alert_events
from utils.timefmt import parse_utc, to_iso_utc, utc_text

router = APIRouter()

DEFAULT_WINDOW_SECONDS = 24 * 60 * 60
DEFAULT_ALERT_LIMIT = 500
MAX_ALERT_LIMIT = 1000


def _stored_text(moment: datetime) -> str:
    """A request timestamp as the stored UTC text. One without an offset is taken as UTC."""
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return utc_text(moment.timestamp())


def _seconds_between(start: str, end: str) -> int:
    return int((parse_utc(end) - parse_utc(start)).total_seconds())


def serialize_alert(row: dict) -> dict:
    """One alert_events row in the shape the API and the alert_event WebSocket message share."""
    ended_at = row["ended_at"]
    has_top_process = row["top_process"] is not None
    return {
        "id": row["id"],
        "metric": row["metric"],
        "level": row["level"],
        "threshold": row["threshold"],
        "started_at": to_iso_utc(row["started_at"]),
        "ended_at": to_iso_utc(ended_at) if ended_at else None,
        "duration_seconds": _seconds_between(row["started_at"], ended_at) if ended_at else None,
        "peak_value": row["peak_value"],
        "readings": {"cpu": row["cpu_at_start"], "ram": row["ram_at_start"], "disk": row["disk_at_start"]},
        "top_process": {
            "name": row["top_process"],
            "pid": row["top_process_pid"],
            "value": row["top_process_value"],
        } if has_top_process else None,
        "muted": bool(row["muted"]),
    }


@router.get("/api/alerts")
async def list_alerts(
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
    metric: Literal["cpu", "ram", "disk", "process"] | None = None,
    level: Literal["warning", "critical"] | None = None,
    limit: Annotated[int, Query(ge=1, le=MAX_ALERT_LIMIT)] = DEFAULT_ALERT_LIMIT,
):
    """Alert episodes that started inside the window: ongoing ones first, then newest first."""
    now = time.time()
    # Stored times have one-second resolution and the upper bound is exclusive, so "until now"
    # reaches one second ahead or an alert that started this very second would be left out.
    end_text = _stored_text(end) if end else utc_text(now + 1)
    start_text = _stored_text(start) if start else utc_text(now - DEFAULT_WINDOW_SECONDS)
    if start_text >= end_text:
        raise HTTPException(
            status_code=400,
            detail={"code": "invalid_range", "message": "The start of the range must be earlier than its end."},
        )

    # One row more than asked for is how a longer result is told from one that exactly fits
    rows = await get_alert_events(start_text, end_text, metric, level, limit + 1)
    return {
        "alerts": [serialize_alert(row) for row in rows[:limit]],
        "truncated": len(rows) > limit,
    }
