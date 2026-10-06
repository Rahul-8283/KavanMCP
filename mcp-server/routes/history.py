"""Read-only routes over the history tables. Attached to the dashboard app in ws_server.py."""
import time
from datetime import datetime, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query

from config.settings_manager import ACTIVE_CONFIG
from database.db import get_alert_events, get_metrics_history, get_oldest_metrics_minute
from handlers.history_recorder import ALERT_METRICS, SAMPLE_INTERVAL_SECONDS
from utils.timefmt import SECONDS_PER_MINUTE, parse_utc, to_iso_utc, utc_text

router = APIRouter()

DEFAULT_WINDOW_SECONDS = 24 * 60 * 60
DEFAULT_ALERT_LIMIT = 500
MAX_ALERT_LIMIT = 1000

MINUTE = SECONDS_PER_MINUTE
HOUR = 60 * MINUTE
DAY = 24 * HOUR

HISTORY_RANGES = {"1h": HOUR, "6h": 6 * HOUR, "24h": DAY, "7d": 7 * DAY}
MIN_HISTORY_SPAN = 10 * MINUTE
MAX_HISTORY_SPAN = 7 * DAY

# (longest span, bucket). A chart stays at roughly 60 to 190 points whatever is asked for,
# so zooming in is answered with finer buckets and detail is never lost.
BUCKET_STEPS = (
    (2 * HOUR, MINUTE),
    (12 * HOUR, 5 * MINUTE),
    (48 * HOUR, 15 * MINUTE),
)
WIDEST_BUCKET = 2 * HOUR


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


def bucket_for(span_seconds: float) -> int:
    """The bucket size used for a window of this length."""
    for longest_span, bucket in BUCKET_STEPS:
        if span_seconds <= longest_span:
            return bucket
    return WIDEST_BUCKET


def _bad_request(code: str, message: str) -> HTTPException:
    return HTTPException(status_code=400, detail={"code": code, "message": message})


def _coverage(samples: int, bucket_start: int, bucket_seconds: int, now: float) -> float:
    """
    The share of a bucket the backend was really sampling for. The part of a bucket that has
    not happened yet is not counted against it, and neither is the minute still being collected.
    """
    recorded_until = now - now % MINUTE
    measurable = min(bucket_start + bucket_seconds, recorded_until) - bucket_start
    if measurable <= 0:
        return 1.0
    return round(min(samples * SAMPLE_INTERVAL_SECONDS / measurable, 1.0), 2)


@router.get("/api/metrics/history")
async def metrics_history(
    preset: Annotated[Literal["1h", "6h", "24h", "7d"], Query(alias="range")] = "24h",
    start: Annotated[datetime | None, Query(alias="from")] = None,
    end: Annotated[datetime | None, Query(alias="to")] = None,
):
    """CPU, memory and disk over a window, merged into buckets sized to the window."""
    now = time.time()
    if (start is None) != (end is None):
        raise _bad_request("invalid_range", "Give both the start and the end of the range, or neither.")

    if start is None:
        end_epoch = now
        start_epoch = now - HISTORY_RANGES[preset]
    else:
        start_epoch = parse_utc(_stored_text(start)).timestamp()
        end_epoch = parse_utc(_stored_text(end)).timestamp()
        span = end_epoch - start_epoch
        if span <= 0:
            raise _bad_request("invalid_range", "The start of the range must be earlier than its end.")
        if span < MIN_HISTORY_SPAN:
            raise _bad_request("range_too_short", "The range must cover at least 10 minutes.")
        if span > MAX_HISTORY_SPAN:
            raise _bad_request("range_too_long", "The range can cover at most 7 days.")

    bucket = bucket_for(end_epoch - start_epoch)
    # The query groups minutes into buckets aligned to the epoch. The window is widened to the
    # same boundaries, so a client can step through it and find every bucket where it expects one.
    start_epoch -= start_epoch % bucket
    end_epoch += -end_epoch % bucket

    rows = await get_metrics_history(utc_text(start_epoch), utc_text(end_epoch), bucket)
    oldest = await get_oldest_metrics_minute()
    return {
        "from": to_iso_utc(utc_text(start_epoch)),
        "to": to_iso_utc(utc_text(end_epoch)),
        "bucket_seconds": bucket,
        "recording_since": to_iso_utc(oldest) if oldest else None,
        "thresholds": {metric: ACTIVE_CONFIG.get(config_key) for metric, config_key, _ in ALERT_METRICS},
        "points": [
            {
                "t": to_iso_utc(utc_text(row["bucket_start"])),
                "cpu_avg": round(row["cpu_avg"], 2),
                "cpu_max": round(row["cpu_max"], 2),
                "ram_avg": round(row["ram_avg"], 2),
                "ram_max": round(row["ram_max"], 2),
                "disk_avg": round(row["disk_avg"], 2),
                "coverage": _coverage(row["samples"], row["bucket_start"], bucket, now),
            }
            for row in rows
        ],
    }
