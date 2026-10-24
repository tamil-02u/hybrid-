"""
bookings.py — Bookings blueprint for SmartHarvest.
Prefix: /api/bookings
All routes require authentication.
"""

import sqlite3
from datetime import date, datetime

from flask import Blueprint, request, jsonify
from flask_login import login_required, current_user

from database import get_db, _db_path
from models import check_slot_availability, booking_to_dict

bookings_bp = Blueprint("bookings", __name__, url_prefix="/api/bookings")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_ok(data: dict, status: int = 200):
    return jsonify({"success": True, "data": data}), status


def _json_err(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _validate_booking_fields(body: dict):
    """Return (errors_list, cleaned_fields_dict)."""
    errors = []
    required = ["slot_id", "crop_category", "crop_type", "quantity", "unit",
                "start_date", "start_time", "end_date", "end_time"]
    for field in required:
        if not body.get(field) and body.get(field) != 0:
            errors.append(f"'{field}' is required.")

    if errors:
        return errors, {}

    try:
        quantity = float(body["quantity"])
        if quantity <= 0:
            errors.append("'quantity' must be a positive number.")
    except (ValueError, TypeError):
        errors.append("'quantity' must be a numeric value.")
        quantity = 0.0

    # Date/time format checks
    for field, fmt in [
        ("start_date", "%Y-%m-%d"), ("end_date", "%Y-%m-%d"),
        ("start_time", "%H:%M"),    ("end_time", "%H:%M"),
    ]:
        try:
            datetime.strptime(str(body[field]), fmt)
        except ValueError:
            errors.append(f"'{field}' has an invalid format (expected {fmt.replace('%Y', 'YYYY').replace('%m', 'MM').replace('%d', 'DD').replace('%H', 'HH').replace('%M', 'MM')}).")

    if not errors:
        start_dt = datetime.strptime(
            f"{body['start_date']} {body['start_time']}", "%Y-%m-%d %H:%M"
        )
        end_dt = datetime.strptime(
            f"{body['end_date']} {body['end_time']}", "%Y-%m-%d %H:%M"
        )
        if end_dt <= start_dt:
            errors.append("End date/time must be after start date/time.")

    return errors, {
        "slot_id":       int(body["slot_id"]),
        "crop_category": str(body["crop_category"]).strip(),
        "crop_type":     str(body["crop_type"]).strip(),
        "quantity":      quantity,
        "unit":          str(body["unit"]).strip(),
        "location":      str(body.get("location") or "").strip(),
        "start_date":    str(body["start_date"]),
        "start_time":    str(body["start_time"]),
        "end_date":      str(body["end_date"]),
        "end_time":      str(body["end_time"]),
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@bookings_bp.route("/", methods=["POST"])
@login_required
def create_booking():
    """
    Create a new booking.
    Uses BEGIN EXCLUSIVE to prevent race conditions on slot availability.
    """
    body = request.get_json(silent=True) or {}
    errors, fields = _validate_booking_fields(body)
    if errors:
        return _json_err(errors[0], 422)

    # Verify slot exists and is enabled
    db = get_db()
    slot = db.execute(
        "SELECT * FROM slots WHERE id = ? AND is_enabled = 1", (fields["slot_id"],)
    ).fetchone()
    if not slot:
        return _json_err("Slot not found or not available.", 404)

    # Verify the crop category is supported by this slot
    supported = [c.strip() for c in (slot["supported_categories"] or "").split(",")]
    if fields["crop_category"] not in supported:
        return _json_err(
            f"Slot '{slot['name']}' does not support category '{fields['crop_category']}'."
        )

    # ── Exclusive transaction to prevent double-booking ─────────────────────
    # We open a *new* sqlite3 connection with BEGIN EXCLUSIVE so that no other
    # writer can interleave between our availability check and our INSERT.
    try:
        raw_conn = sqlite3.connect(_db_path())
        raw_conn.row_factory = sqlite3.Row
        raw_conn.execute("PRAGMA foreign_keys=ON")
        raw_conn.execute("BEGIN EXCLUSIVE")

        # Re-check availability inside the exclusive transaction
        b_start = f"{fields['start_date']} {fields['start_time']}"
        b_end   = f"{fields['end_date']} {fields['end_time']}"
        conflict = raw_conn.execute(
            """
            SELECT COUNT(*) FROM bookings
            WHERE slot_id = ?
              AND status  = 'active'
              AND (start_date || ' ' || start_time) < ?
              AND (end_date   || ' ' || end_time)   > ?
            """,
            (fields["slot_id"], b_end, b_start),
        ).fetchone()[0]

        if conflict > 0:
            raw_conn.rollback()
            raw_conn.close()
            return _json_err(
                "This slot is already booked for the selected time window.", 409
            )

        cursor = raw_conn.execute(
            """
            INSERT INTO bookings
                (user_id, slot_id, crop_category, crop_type, quantity, unit,
                 location, start_date, start_time, end_date, end_time, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
            """,
            (
                current_user.id,
                fields["slot_id"],
                fields["crop_category"],
                fields["crop_type"],
                fields["quantity"],
                fields["unit"],
                fields["location"],
                fields["start_date"],
                fields["start_time"],
                fields["end_date"],
                fields["end_time"],
            ),
        )
        booking_id = cursor.lastrowid
        raw_conn.commit()
        raw_conn.close()

    except sqlite3.Error as exc:
        return _json_err(f"Database error: {exc}", 500)

    # Fetch the newly created booking to return it
    row = db.execute(
        """
        SELECT b.*, s.name AS slot_name
        FROM bookings b JOIN slots s ON b.slot_id = s.id
        WHERE b.id = ?
        """,
        (booking_id,),
    ).fetchone()

    return _json_ok({"booking": booking_to_dict(row)}, 201)


@bookings_bp.route("/my", methods=["GET"])
@login_required
def my_bookings():
    """Return all bookings belonging to the current user."""
    db = get_db()
    rows = db.execute(
        """
        SELECT b.*, s.name AS slot_name
        FROM bookings b JOIN slots s ON b.slot_id = s.id
        WHERE b.user_id = ?
        ORDER BY b.created_at DESC
        """,
        (current_user.id,),
    ).fetchall()

    return _json_ok({"bookings": [booking_to_dict(r) for r in rows]})


@bookings_bp.route("/<int:booking_id>", methods=["GET"])
@login_required
def get_booking(booking_id: int):
    """Return a single booking if it belongs to the current user."""
    db = get_db()
    row = db.execute(
        """
        SELECT b.*, s.name AS slot_name
        FROM bookings b JOIN slots s ON b.slot_id = s.id
        WHERE b.id = ? AND b.user_id = ?
        """,
        (booking_id, current_user.id),
    ).fetchone()

    if row is None:
        return _json_err("Booking not found.", 404)

    return _json_ok({"booking": booking_to_dict(row)})


@bookings_bp.route("/<int:booking_id>/cancel", methods=["DELETE"])
@login_required
def cancel_booking(booking_id: int):
    """
    Cancel a booking.
    Only allowed if:
      - The booking belongs to the current user.
      - The booking status is 'active'.
      - The start_date is today or in the future.
    """
    db = get_db()
    row = db.execute(
        "SELECT * FROM bookings WHERE id = ? AND user_id = ?",
        (booking_id, current_user.id),
    ).fetchone()

    if row is None:
        return _json_err("Booking not found.", 404)
    if row["status"] != "active":
        return _json_err(
            f"Cannot cancel a booking with status '{row['status']}'.", 400
        )
    if row["start_date"] < str(date.today()):
        return _json_err(
            "Cannot cancel a booking whose start date has already passed.", 400
        )

    db.execute(
        "UPDATE bookings SET status = 'cancelled' WHERE id = ?", (booking_id,)
    )
    db.commit()

    return _json_ok({"message": "Booking cancelled successfully.", "booking_id": booking_id})
