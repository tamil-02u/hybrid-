"""
sensors.py — Sensor readings & demo data generator blueprint for SmartHarvest.
Prefix: /api/sensors
"""

import math
import sqlite3
import threading
import time
from datetime import datetime

from flask import Blueprint, request, jsonify, current_app

from database import get_db, _db_path

sensors_bp = Blueprint("sensors", __name__, url_prefix="/api/sensors")

# ---------------------------------------------------------------------------
# Demo thread state
# ---------------------------------------------------------------------------
_demo_thread: threading.Thread | None = None
_demo_stop_event = threading.Event()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _json_ok(data: dict, status: int = 200):
    return jsonify({"success": True, "data": data}), status


def _json_err(message: str, status: int = 400):
    return jsonify({"error": message}), status


def _get_thresholds(config: dict, crop_category: str | None) -> dict:
    """Return threshold dict for the given crop category (fallback to default)."""
    thresholds: dict = config.get("THRESHOLDS", {})
    return thresholds.get(crop_category or "", thresholds.get("default", {
        "temperature": {"warning": 26.0, "critical": 32.0},
        "humidity":    {"warning": 80.0, "critical": 90.0},
        "gas_level":   {"warning": 400,  "critical": 700},
    }))


def _run_alert_logic(
    db_path: str,
    slot_id: int,
    reading_id: int,
    temperature: float,
    humidity: float,
    gas_level: float,
):
    """
    Compare sensor values against the active booking's crop thresholds and
    insert alert rows as needed. Runs on the raw sqlite3 connection so it
    can be called from the demo background thread too.
    """
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys=ON")

    try:
        # Find the active booking for this slot to get the crop category
        now_date = datetime.utcnow().strftime("%Y-%m-%d")
        now_time = datetime.utcnow().strftime("%H:%M")
        booking = conn.execute(
            """
            SELECT crop_category FROM bookings
            WHERE slot_id = ? AND status = 'active'
              AND start_date <= ? AND end_date >= ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (slot_id, now_date, now_date),
        ).fetchone()

        crop_category = booking["crop_category"] if booking else None

        # Load thresholds from a quick config import (avoid circular import)
        from config import Config
        thresholds = _get_thresholds(
            {"THRESHOLDS": Config.THRESHOLDS}, crop_category
        )

        def _insert_alert(alert_type, severity, message):
            conn.execute(
                """
                INSERT INTO alerts (slot_id, alert_type, severity, message)
                VALUES (?, ?, ?, ?)
                """,
                (slot_id, alert_type, severity, message),
            )

        # Temperature
        t_thresh = thresholds.get("temperature", {})
        if temperature >= t_thresh.get("critical", 999):
            _insert_alert(
                "TEMPERATURE", "CRITICAL",
                f"Temperature {temperature:.1f}°C exceeds critical threshold "
                f"({t_thresh['critical']}°C) for slot {slot_id}."
            )
        elif temperature >= t_thresh.get("warning", 999):
            _insert_alert(
                "TEMPERATURE", "WARNING",
                f"Temperature {temperature:.1f}°C exceeds warning threshold "
                f"({t_thresh['warning']}°C) for slot {slot_id}."
            )

        # Humidity
        h_thresh = thresholds.get("humidity", {})
        if humidity >= h_thresh.get("critical", 999):
            _insert_alert(
                "HUMIDITY", "CRITICAL",
                f"Humidity {humidity:.1f}% exceeds critical threshold "
                f"({h_thresh['critical']}%) for slot {slot_id}."
            )
        elif humidity >= h_thresh.get("warning", 999):
            _insert_alert(
                "HUMIDITY", "WARNING",
                f"Humidity {humidity:.1f}% exceeds warning threshold "
                f"({h_thresh['warning']}%) for slot {slot_id}."
            )

        # Gas level (raw ADC units — uncalibrated)
        g_thresh = thresholds.get("gas_level", {})
        if gas_level >= g_thresh.get("critical", 9999):
            _insert_alert(
                "GAS_LEVEL", "CRITICAL",
                f"Gas level {gas_level:.0f} raw sensor units exceeds critical threshold "
                f"({g_thresh['critical']}) for slot {slot_id}. "
                "(Raw ADC-style units, uncalibrated.)"
            )
        elif gas_level >= g_thresh.get("warning", 9999):
            _insert_alert(
                "GAS_LEVEL", "WARNING",
                f"Gas level {gas_level:.0f} raw sensor units exceeds warning threshold "
                f"({g_thresh['warning']}) for slot {slot_id}. "
                "(Raw ADC-style units, uncalibrated.)"
            )

        conn.commit()
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Demo data generator
# ---------------------------------------------------------------------------

def _generate_demo_readings(db_path: str, poll_interval: int):
    """
    Background thread: insert one sensor reading per slot every poll_interval
    seconds with realistic sine-wave variation.
    """
    t = 0.0
    while not _demo_stop_event.is_set():
        t += 1
        try:
            conn = sqlite3.connect(db_path)
            conn.execute("PRAGMA foreign_keys=ON")

            for slot_id in range(1, 6):
                # Sine offset differs per slot so each slot tells a different story
                phase = slot_id * (math.pi / 3)

                # Temperature: 18–35 °C with gentle sine wave
                base_temp   = 24.0 + slot_id * 0.8
                temperature = base_temp + 5.0 * math.sin(t * 0.1 + phase)
                temperature = round(temperature, 2)

                # Humidity: 50–90 %
                base_hum = 65.0 + slot_id * 2.0
                humidity = base_hum + 12.0 * math.sin(t * 0.07 + phase + 1)
                humidity = max(50.0, min(90.0, round(humidity, 2)))

                # Gas level: 100–800 raw ADC-style units (uncalibrated)
                base_gas = 200.0 + slot_id * 30.0
                gas_level = base_gas + 200.0 * math.sin(t * 0.05 + phase + 2)
                gas_level = max(100.0, min(800.0, round(gas_level, 2)))

                # Fan: ON if temperature above a soft threshold (27 °C)
                fan_status = "ON" if temperature > 27.0 else "OFF"

                device_id = f"DEMO-SLOT-{slot_id:02d}"

                cursor = conn.execute(
                    """
                    INSERT INTO sensor_readings
                        (slot_id, device_id, temperature, humidity, gas_level, fan_status)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    (slot_id, device_id, temperature, humidity, gas_level, fan_status),
                )
                reading_id = cursor.lastrowid
                conn.commit()
                conn.close()

                # Alert logic (opens its own connection)
                _run_alert_logic(
                    db_path, slot_id, reading_id,
                    temperature, humidity, gas_level
                )

                conn = sqlite3.connect(db_path)
                conn.execute("PRAGMA foreign_keys=ON")

            conn.close()
        except Exception as exc:
            # Don't crash the thread on transient DB errors
            print(f"[Demo thread] Error: {exc}")

        _demo_stop_event.wait(poll_interval)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@sensors_bp.route("/readings", methods=["POST"])
def ingest_reading():
    """
    Accept a sensor reading from an IoT device.

    Expected JSON body:
      {
        "slot_id":     <int>,
        "device_id":   <str>,
        "temperature": <float>,
        "humidity":    <float>,
        "gas_level":   <float>,   # raw ADC units — uncalibrated
        "fan_status":  "ON" | "OFF"
      }

    Required header:
      Authorization: Bearer <DEVICE_AUTH_TOKEN>
    """
    # ── Auth ────────────────────────────────────────────────────────────────
    auth_header = request.headers.get("Authorization", "")
    expected_token = current_app.config.get("DEVICE_AUTH_TOKEN", "")
    if not auth_header.startswith("Bearer ") or auth_header[7:] != expected_token:
        return _json_err("Invalid or missing device token.", 401)

    body = request.get_json(silent=True) or {}

    slot_id     = body.get("slot_id")
    device_id   = body.get("device_id") or ""
    temperature = body.get("temperature")
    humidity    = body.get("humidity")
    gas_level   = body.get("gas_level")
    fan_status  = (body.get("fan_status") or "UNKNOWN").upper()

    # ── Validation ────────────────────────────────────────────────────────────
    if slot_id is None:
        return _json_err("'slot_id' is required.", 422)
    if temperature is None or humidity is None or gas_level is None:
        return _json_err("'temperature', 'humidity', and 'gas_level' are required.", 422)

    try:
        slot_id     = int(slot_id)
        temperature = float(temperature)
        humidity    = float(humidity)
        gas_level   = float(gas_level)
    except (ValueError, TypeError):
        return _json_err("Numeric fields must be valid numbers.", 422)

    # Verify slot exists
    db = get_db()
    slot = db.execute("SELECT id FROM slots WHERE id = ?", (slot_id,)).fetchone()
    if slot is None:
        return _json_err(f"Slot {slot_id} not found.", 404)

    # ── Insert reading ────────────────────────────────────────────────────────
    cursor = db.execute(
        """
        INSERT INTO sensor_readings (slot_id, device_id, temperature, humidity, gas_level, fan_status)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        (slot_id, device_id, temperature, humidity, gas_level, fan_status),
    )
    db.commit()
    reading_id = cursor.lastrowid

    # ── Alert logic (in a background-friendly way using raw connection) ───────
    threading.Thread(
        target=_run_alert_logic,
        args=(_db_path(), slot_id, reading_id, temperature, humidity, gas_level),
        daemon=True,
    ).start()

    return _json_ok(
        {
            "reading_id": reading_id,
            "slot_id":    slot_id,
            "message":    "Reading recorded.",
        },
        201,
    )


@sensors_bp.route("/demo/start", methods=["GET"])
def demo_start():
    """Start the background demo data generator (DEMO_MODE only)."""
    global _demo_thread

    if not current_app.config.get("DEMO_MODE", False):
        return _json_err("Demo mode is disabled.", 403)

    if _demo_thread and _demo_thread.is_alive():
        return _json_ok({"message": "Demo generator is already running."})

    poll_interval = current_app.config.get("SENSOR_POLL_INTERVAL", 5)
    db_path       = _db_path()

    _demo_stop_event.clear()
    _demo_thread = threading.Thread(
        target=_generate_demo_readings,
        args=(db_path, poll_interval),
        daemon=True,
        name="SmartHarvest-Demo",
    )
    _demo_thread.start()

    return _json_ok(
        {
            "message":       "Demo data generator started.",
            "poll_interval": poll_interval,
        }
    )


@sensors_bp.route("/demo/stop", methods=["GET"])
def demo_stop():
    """Stop the background demo data generator."""
    global _demo_thread

    if not current_app.config.get("DEMO_MODE", False):
        return _json_err("Demo mode is disabled.", 403)

    if _demo_thread is None or not _demo_thread.is_alive():
        return _json_ok({"message": "Demo generator is not running."})

    _demo_stop_event.set()
    _demo_thread.join(timeout=10)
    _demo_thread = None

    return _json_ok({"message": "Demo data generator stopped."})
