"""
slots.py — Slots blueprint for SmartHarvest.
Prefix: /api/slots
"""

from datetime import datetime, timezone

from flask import Blueprint, jsonify
from flask_login import login_required, current_user

from database import get_db

slots_bp = Blueprint("slots", __name__, url_prefix="/api/slots")

_DEVICE_STALE_SECONDS = 60  # consider device offline if no reading within 60 s


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_ok(data: dict, status: int = 200):
    return jsonify({"success": True, "data": data}), status


def _json_err(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _slot_to_dict(row) -> dict:
    return {
        "id":                   row["id"],
        "name":                 row["name"],
        "is_enabled":           bool(row["is_enabled"]),
        "supported_categories": [c.strip() for c in (row["supported_categories"] or "").split(",")],
        "description":          row["description"],
    }


def _user_has_active_booking_for_slot(user_id: int, slot_id: int) -> bool:
    """Return True if the user currently has an active booking for this slot."""
    db = get_db()
    now_date = datetime.now().strftime("%Y-%m-%d")
    now_time = datetime.now().strftime("%H:%M")
    row = db.execute(
        """
        SELECT COUNT(*) FROM bookings
        WHERE user_id = ? AND slot_id = ? AND status = 'active'
          AND start_date <= ? AND end_date >= ?
          AND (start_date < ? OR start_time <= ?)
          AND (end_date   > ? OR end_time   >= ?)
        """,
        (user_id, slot_id,
         now_date, now_date,
         now_date, now_time,
         now_date, now_time),
    ).fetchone()
    return row[0] > 0


def _is_slot_occupied_now(slot_id: int) -> bool:
    """Return True if there is currently an active booking for this slot."""
    db = get_db()
    now_date = datetime.now().strftime("%Y-%m-%d")
    now_time = datetime.now().strftime("%H:%M")
    row = db.execute(
        """
        SELECT COUNT(*) FROM bookings
        WHERE slot_id = ? AND status = 'active'
          AND start_date <= ? AND end_date >= ?
          AND (start_date < ? OR start_time <= ?)
          AND (end_date   > ? OR end_time   >= ?)
        """,
        (slot_id,
         now_date, now_date,
         now_date, now_time,
         now_date, now_time),
    ).fetchone()
    return row[0] > 0


def _device_status(slot_id: int) -> dict:
    """Return IoT connection info based on the most recent sensor reading."""
    db = get_db()
    row = db.execute(
        "SELECT * FROM sensor_readings WHERE slot_id = ? ORDER BY timestamp DESC LIMIT 1",
        (slot_id,),
    ).fetchone()

    if row is None:
        return {"online": False, "last_seen": None, "device_id": None}

    last_seen_str: str = row["timestamp"]
    # Parse the stored timestamp (SQLite stores as text in ISO format)
    try:
        last_seen = datetime.strptime(last_seen_str, "%Y-%m-%d %H:%M:%S")
    except ValueError:
        last_seen = datetime.strptime(last_seen_str[:19], "%Y-%m-%dT%H:%M:%S")

    age_seconds = (datetime.utcnow() - last_seen).total_seconds()
    online = age_seconds <= _DEVICE_STALE_SECONDS

    return {
        "online":    online,
        "last_seen": last_seen_str,
        "device_id": row["device_id"],
        "age_seconds": round(age_seconds),
    }


def _latest_reading(slot_id: int) -> dict | None:
    db = get_db()
    row = db.execute(
        "SELECT * FROM sensor_readings WHERE slot_id = ? ORDER BY timestamp DESC LIMIT 1",
        (slot_id,),
    ).fetchone()
    if row is None:
        return None
    return {
        "temperature": row["temperature"],
        "humidity":    row["humidity"],
        "gas_level":   row["gas_level"],
        "fan_status":  row["fan_status"],
        "timestamp":   row["timestamp"],
        "device_id":   row["device_id"],
    }


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@slots_bp.route("/", methods=["GET"])
def list_slots():
    """
    Return all 5 slots with their current availability (is any booking active right now?).
    """
    db = get_db()
    rows = db.execute("SELECT * FROM slots ORDER BY id").fetchall()

    result = []
    for row in rows:
        slot = _slot_to_dict(row)
        slot["occupied_now"] = _is_slot_occupied_now(row["id"])
        slot["available"]    = row["is_enabled"] and not slot["occupied_now"]
        result.append(slot)

    return _json_ok({"slots": result})


@slots_bp.route("/<int:slot_id>/status", methods=["GET"])
def slot_status(slot_id: int):
    """
    Return slot info, current IoT device connection status, and latest sensor values.
    """
    db = get_db()
    row = db.execute("SELECT * FROM slots WHERE id = ?", (slot_id,)).fetchone()
    if row is None:
        return _json_err("Slot not found.", 404)

    slot = _slot_to_dict(row)
    slot["occupied_now"]   = _is_slot_occupied_now(slot_id)
    slot["device_status"]  = _device_status(slot_id)
    slot["latest_reading"] = _latest_reading(slot_id)

    return _json_ok({"slot": slot})


@slots_bp.route("/<int:slot_id>/readings", methods=["GET"])
@login_required
def slot_readings(slot_id: int):
    """
    Return the last 50 sensor readings for a slot.
    Requires the current user to have an active booking for this slot.
    """
    db = get_db()
    slot = db.execute("SELECT id FROM slots WHERE id = ?", (slot_id,)).fetchone()
    if slot is None:
        return _json_err("Slot not found.", 404)

    if not _user_has_active_booking_for_slot(current_user.id, slot_id):
        return _json_err("You do not have an active booking for this slot.", 403)

    rows = db.execute(
        """
        SELECT * FROM sensor_readings
        WHERE slot_id = ?
        ORDER BY timestamp DESC
        LIMIT 50
        """,
        (slot_id,),
    ).fetchall()

    readings = [
        {
            "id":          r["id"],
            "slot_id":     r["slot_id"],
            "device_id":   r["device_id"],
            "temperature": r["temperature"],
            "humidity":    r["humidity"],
            "gas_level":   r["gas_level"],
            "fan_status":  r["fan_status"],
            "timestamp":   r["timestamp"],
        }
        for r in rows
    ]

    return _json_ok({"readings": readings, "count": len(readings)})


@slots_bp.route("/<int:slot_id>/alerts", methods=["GET"])
@login_required
def slot_alerts(slot_id: int):
    """Return alerts for a slot (requires active booking)."""
    db = get_db()
    slot = db.execute("SELECT id FROM slots WHERE id = ?", (slot_id,)).fetchone()
    if slot is None:
        return _json_err("Slot not found.", 404)

    if not _user_has_active_booking_for_slot(current_user.id, slot_id):
        return _json_err("You do not have an active booking for this slot.", 403)

    rows = db.execute(
        """
        SELECT * FROM alerts
        WHERE slot_id = ?
        ORDER BY created_at DESC
        LIMIT 100
        """,
        (slot_id,),
    ).fetchall()

    alerts = [
        {
            "id":          a["id"],
            "slot_id":     a["slot_id"],
            "alert_type":  a["alert_type"],
            "severity":    a["severity"],
            "message":     a["message"],
            "is_resolved": bool(a["is_resolved"]),
            "created_at":  a["created_at"],
            "resolved_at": a["resolved_at"],
        }
        for a in rows
    ]

    return _json_ok({"alerts": alerts, "count": len(alerts)})


@slots_bp.route("/<int:slot_id>/fan-command", methods=["POST"])
@login_required
def fan_command(slot_id: int):
    """
    Send a fan on/off command for a slot.
    Requires the current user to have an active booking for this slot.
    """
    from flask import request

    db = get_db()
    slot = db.execute("SELECT id FROM slots WHERE id = ?", (slot_id,)).fetchone()
    if slot is None:
        return _json_err("Slot not found.", 404)

    if not _user_has_active_booking_for_slot(current_user.id, slot_id):
        return _json_err("You do not have an active booking for this slot.", 403)

    body = request.get_json(silent=True) or {}
    # Accept either "requested_state" (from frontend JS) or "state"
    requested_state = (body.get("requested_state") or body.get("state") or "").strip().upper()
    if requested_state not in ("ON", "OFF"):
        return _json_err("'requested_state' must be 'ON' or 'OFF'.", 400)

    cursor = db.execute(
        """
        INSERT INTO fan_commands (slot_id, requested_state, user_id)
        VALUES (?, ?, ?)
        """,
        (slot_id, requested_state, current_user.id),
    )
    db.commit()

    return _json_ok(
        {
            "command_id":      cursor.lastrowid,
            "slot_id":         slot_id,
            "requested_state": requested_state,
            "message":         f"Fan command '{requested_state}' queued for slot {slot_id}.",
        },
        201,
    )
