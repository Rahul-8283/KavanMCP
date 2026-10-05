"""
Timestamp conversions for the history tables. Every stored time is UTC text in the form
SQLite's CURRENT_TIMESTAMP writes, so datetime('now', ...) comparisons work on all tables.
"""
from datetime import datetime, timezone

STORED_FORMAT = "%Y-%m-%d %H:%M:%S"
SECONDS_PER_MINUTE = 60


def utc_text(epoch: float) -> str:
    """Epoch seconds to the stored text form."""
    return datetime.fromtimestamp(epoch, timezone.utc).strftime(STORED_FORMAT)


def minute_text(epoch: float) -> str:
    """Epoch seconds to the stored text form, truncated to the start of its minute."""
    return utc_text(epoch - epoch % SECONDS_PER_MINUTE)


def to_iso_utc(text: str) -> str:
    """Stored text to ISO 8601 with a Z suffix, for API responses."""
    stored = datetime.strptime(text, STORED_FORMAT).replace(tzinfo=timezone.utc)
    return stored.strftime("%Y-%m-%dT%H:%M:%SZ")
