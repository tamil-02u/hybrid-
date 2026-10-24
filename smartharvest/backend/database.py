"""
database.py — SQLite database helpers for SmartHarvest (no ORM).
"""

import os
import sqlite3
from flask import g, current_app


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------

def _db_path() -> str:
    """Resolve the SQLite file path from the app config."""
    uri: str = current_app.config.get("DATABASE_URI", "sqlite:///smartharvest.db")
    relative = uri.replace("sqlite:///", "")
    # If the path is relative, anchor it next to this file (backend folder).
    if not os.path.isabs(relative):
        base = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(base, relative)
    return relative


def get_db() -> sqlite3.Connection:
    """
    Return a per-request SQLite connection stored on Flask's `g` object.
    Rows are accessible as both index and column name.
    """
    if "db" not in g:
        g.db = sqlite3.connect(
            _db_path(),
            detect_types=sqlite3.PARSE_DECLTYPES | sqlite3.PARSE_COLNAMES,
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA journal_mode=WAL")   # better concurrency
        g.db.execute("PRAGMA foreign_keys=ON")
    return g.db


def close_db(exception=None):
    """Close the database connection at the end of the request."""
    db = g.pop("db", None)
    if db is not None:
        db.close()


# ---------------------------------------------------------------------------
# Schema creation
# ---------------------------------------------------------------------------

_SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    phone         TEXT,
    email         TEXT    UNIQUE NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS slots (
    id                   INTEGER PRIMARY KEY,
    name                 TEXT    NOT NULL,
    is_enabled           INTEGER DEFAULT 1,
    supported_categories TEXT    DEFAULT 'Vegetables,Fruits',
    description          TEXT
);

CREATE TABLE IF NOT EXISTS bookings (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id       INTEGER REFERENCES users(id) ON DELETE CASCADE,
    slot_id       INTEGER REFERENCES slots(id) ON DELETE CASCADE,
    crop_category TEXT,
    crop_type     TEXT,
    quantity      REAL,
    unit          TEXT,
    location      TEXT,
    start_date    DATE,
    start_time    TIME,
    end_date      DATE,
    end_time      TIME,
    status        TEXT    DEFAULT 'active'
                  CHECK(status IN ('active','cancelled','completed')),
    created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor_readings (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id     INTEGER REFERENCES slots(id) ON DELETE CASCADE,
    device_id   TEXT,
    temperature REAL,
    humidity    REAL,
    gas_level   REAL,
    fan_status  TEXT,
    timestamp   DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS fan_commands (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id         INTEGER REFERENCES slots(id) ON DELETE CASCADE,
    requested_state TEXT,
    confirmed_state TEXT,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    requested_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
    confirmed_at    DATETIME
);

CREATE TABLE IF NOT EXISTS alerts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    slot_id     INTEGER REFERENCES slots(id) ON DELETE CASCADE,
    alert_type  TEXT,
    severity    TEXT,
    message     TEXT,
    is_resolved INTEGER DEFAULT 0,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    resolved_at DATETIME
);
"""

_SEED_SLOTS = [
    (1, "Slot A", 1, "Vegetables,Fruits,Herbs",
     "Climate-controlled storage bay A — ideal for leafy greens and soft fruits."),
    (2, "Slot B", 1, "Vegetables,Fruits,Root Crops",
     "Storage bay B — suitable for root vegetables and firm fruits."),
    (3, "Slot C", 1, "Grains,Root Crops",
     "Dry storage bay C — optimised for grains and starchy root crops."),
    (4, "Slot D", 1, "Fruits,Vegetables",
     "Refrigerated bay D — extended freshness for perishable produce."),
    (5, "Slot E", 1, "Vegetables,Fruits,Grains,Root Crops,Herbs",
     "General-purpose bay E — flexible configuration for mixed produce."),
]


def init_db():
    """
    Create all tables and seed the slots table if it is empty.
    Must be called within an application context.
    """
    db_file = _db_path()
    os.makedirs(os.path.dirname(db_file), exist_ok=True)

    conn = sqlite3.connect(db_file)
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript(_SCHEMA_SQL)

    # Seed slots only once
    cursor = conn.execute("SELECT COUNT(*) FROM slots")
    if cursor.fetchone()[0] == 0:
        conn.executemany(
            "INSERT INTO slots (id, name, is_enabled, supported_categories, description) "
            "VALUES (?, ?, ?, ?, ?)",
            _SEED_SLOTS,
        )

    conn.commit()
    conn.close()
