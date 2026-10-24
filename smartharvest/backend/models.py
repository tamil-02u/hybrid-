"""
models.py — Flask-Login User class and booking/slot helper functions.
"""

from __future__ import annotations

from typing import Optional
from flask_login import UserMixin

from database import get_db


# ---------------------------------------------------------------------------
# User model (Flask-Login compatible)
# ---------------------------------------------------------------------------

class User(UserMixin):
    """
    Thin wrapper around a users row, compatible with Flask-Login.
    """

    def __init__(self, row):
        self.id: int           = row["id"]
        self.name: str         = row["name"]
        self.phone: str        = row["phone"] or ""
        self.email: str        = row["email"]
        self.password_hash: str = row["password_hash"]
        self.created_at: str   = row["created_at"]

    # ── Flask-Login interface ────────────────────────────────────────────────

    @property
    def is_authenticated(self) -> bool:  # type: ignore[override]
        return True

    @property
    def is_active(self) -> bool:  # type: ignore[override]
        return True

    @property
    def is_anonymous(self) -> bool:  # type: ignore[override]
        return False

    def get_id(self) -> str:
        return str(self.id)

    # ── Serialisation ────────────────────────────────────────────────────────

    def to_dict(self) -> dict:
        return {
            "id":         self.id,
            "name":       self.name,
            "phone":      self.phone,
            "email":      self.email,
            "created_at": self.created_at,
        }

    # ── Class-level lookup helpers ────────────────────────────────────────────

    @staticmethod
    def get_by_id(user_id: int | str) -> Optional["User"]:
        db = get_db()
        row = db.execute(
            "SELECT * FROM users WHERE id = ?", (int(user_id),)
        ).fetchone()
        return User(row) if row else None

    @staticmethod
    def get_by_email(email: str) -> Optional["User"]:
        db = get_db()
        row = db.execute(
            "SELECT * FROM users WHERE email = ?", (email.lower().strip(),)
        ).fetchone()
        return User(row) if row else None


# ---------------------------------------------------------------------------
# Booking helpers
# ---------------------------------------------------------------------------

def booking_to_dict(row) -> dict:
    """Convert a sqlite3.Row booking (optionally joined with slots) to dict."""
    return {
        "id":            row["id"],
        "user_id":       row["user_id"],
        "slot_id":       row["slot_id"],
        "slot_name":     row["slot_name"] if "slot_name" in row.keys() else None,
        "crop_category": row["crop_category"],
        "crop_type":     row["crop_type"],
        "quantity":      row["quantity"],
        "unit":          row["unit"],
        "location":      row["location"],
        "start_date":    row["start_date"],
        "start_time":    row["start_time"],
        "end_date":      row["end_date"],
        "end_time":      row["end_time"],
        "status":        row["status"],
        "created_at":    row["created_at"],
    }


# ---------------------------------------------------------------------------
# Slot availability check
# ---------------------------------------------------------------------------

def check_slot_availability(
    slot_id: int,
    start_date: str,
    start_time: str,
    end_date: str,
    end_time: str,
    exclude_booking_id: Optional[int] = None,
) -> bool:
    """
    Return True if the slot is free for the requested date/time window.

    Overlap condition (A = existing booking, B = new request):
        A.start < B.end  AND  A.end > B.start
    Both datetimes are compared as 'YYYY-MM-DD HH:MM' strings, which sorts
    correctly with SQLite's TEXT comparison.
    """
    db = get_db()

    b_start = f"{start_date} {start_time}"
    b_end   = f"{end_date} {end_time}"

    sql = """
        SELECT COUNT(*) FROM bookings
        WHERE slot_id = ?
          AND status  = 'active'
          AND (start_date || ' ' || start_time) < ?
          AND (end_date   || ' ' || end_time)   > ?
    """
    params: list = [slot_id, b_end, b_start]

    if exclude_booking_id is not None:
        sql += " AND id != ?"
        params.append(exclude_booking_id)

    count = db.execute(sql, params).fetchone()[0]
    return count == 0
