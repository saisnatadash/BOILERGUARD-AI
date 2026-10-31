from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC timestamp, stored consistently in SQLite and PostgreSQL."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
