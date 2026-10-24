# 🌾 SmartHarvest – IoT-Based Smart Storage System for Agricultural Crops

![Python](https://img.shields.io/badge/Python-3.9%2B-blue?logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.x-black?logo=flask&logoColor=white)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.x-FF6384?logo=chartdotjs&logoColor=white)
![IoT](https://img.shields.io/badge/IoT-ESP32%2FArduino-E7352C?logo=arduino&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

SmartHarvest is an end-to-end IoT platform that monitors and manages cold-storage conditions for agricultural crops in real time. ESP32/Arduino devices stream temperature, humidity, and gas-concentration readings to a Flask REST API; a browser-based dashboard visualizes historical trends, raises alerts when thresholds are exceeded, and issues automated fan-relay commands to maintain optimal storage conditions.

---

## Table of Contents

1. [Features](#features)
2. [Screenshots](#screenshots)
3. [Tech Stack](#tech-stack)
4. [Project Structure](#project-structure)
5. [Prerequisites](#prerequisites)
6. [Installation](#installation)
7. [Running the Project](#running-the-project)
8. [Demo Mode](#demo-mode)
9. [API Reference](#api-reference)
10. [ESP32 / Arduino Integration](#esp32--arduino-integration)
11. [Database Schema](#database-schema)
12. [Crop Thresholds](#crop-thresholds)
13. [Troubleshooting](#troubleshooting)
14. [Contributing](#contributing)
15. [License](#license)
16. [Author / Team](#author--team)

---

## Features

- 🌡️ **Real-time monitoring** — temperature, humidity, and gas levels updated every 5 seconds
- 🚨 **Smart alerts** — per-crop threshold violations trigger instant dashboard notifications
- 🤖 **Automated fan control** — backend issues relay ON/OFF commands based on live readings
- 📊 **Historical charts** — time-series graphs (Chart.js) per storage slot with configurable time windows
- 🗄️ **Multi-crop profiles** — 20 pre-configured crop profiles with scientifically grounded thresholds
- 🔐 **Token-based device authentication** — IoT devices authenticate via `X-Device-Token` header
- 🖥️ **Demo mode** — built-in simulated sensor data for evaluation without hardware
- 📱 **Responsive dashboard** — works on desktop, tablet, and mobile browsers
- 🔌 **ESP32/Arduino ready** — complete integration guide and example sketch included
- 🗃️ **SQLite persistence** — zero-dependency database, easy backup and migration
- 📋 **Slot management** — create, assign crops to, and deactivate individual storage slots
- 👤 **User authentication** — session-based login for the web dashboard

---

## Screenshots

> See `/docs/screenshots/` for UI previews of the dashboard, alert panel, historical charts, and slot management screens.

---

## Tech Stack

| Layer      | Technology                       | Purpose                              |
|------------|----------------------------------|--------------------------------------|
| Frontend   | HTML5, CSS3, Vanilla JavaScript  | Dashboard UI, charts, alerts         |
| Charts     | Chart.js 4.x                     | Time-series sensor graphs            |
| Backend    | Python 3.9+, Flask 2.x           | REST API, business logic, auth       |
| Database   | SQLite 3                         | Persistent storage (zero setup)      |
| IoT Device | ESP32 / Arduino (C++)            | Sensor reading, fan relay control    |
| Sensors    | DHT22, MQ-2, MQ-135              | Temperature, humidity, gas           |

---

## Project Structure

```
smartharvest/
├── run.py                        # One-command launcher (start here)
├── .gitignore
├── README.md
│
├── backend/
│   ├── app.py                    # Flask application factory & entry point
│   ├── config.py                 # Config class + CROP_THRESHOLDS dict
│   ├── database.py               # DB initialisation & helper functions
│   ├── models.py                 # SQLite row → Python dataclass helpers
│   ├── smartharvest.db           # SQLite database (auto-created)
│   ├── .env.example              # Environment variable template
│   │
│   └── routes/
│       ├── __init__.py
│       ├── auth.py               # /auth/login, /auth/logout, /auth/register
│       ├── sensors.py            # /api/sensors/readings (IoT POST endpoint)
│       ├── slots.py              # /api/slots CRUD + /api/slots/<id>/status
│       ├── alerts.py             # /api/alerts list & acknowledge
│       └── dashboard.py          # /api/dashboard summary endpoint
│
├── frontend/
│   ├── index.html                # Main dashboard (open in browser)
│   ├── login.html                # Login page
│   │
│   ├── css/
│   │   ├── style.css             # Global styles & layout
│   │   └── dashboard.css         # Dashboard-specific styles
│   │
│   └── js/
│       ├── api.js                # Fetch wrapper, auth token handling
│       ├── dashboard.js          # Slot cards, real-time polling
│       ├── charts.js             # Chart.js wrappers & update logic
│       └── alerts.js             # Alert panel rendering
│
└── docs/
    ├── ESP32_INTEGRATION.md      # Full ESP32/Arduino wiring & sketch guide
    └── CROP_THRESHOLDS.md        # Per-crop threshold reference table
```

---

## Prerequisites

- **Python 3.9+** — [python.org/downloads](https://www.python.org/downloads/)
- **pip** — bundled with Python 3.9+
- **A modern browser** — Chrome 90+, Firefox 88+, Edge 90+, or Safari 14+
- *(Optional)* ESP32 or Arduino board with DHT22 and MQ-series gas sensors

---

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/smartharvest.git
   cd smartharvest
   ```

2. **Create and activate a virtual environment**

   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate

   # macOS / Linux
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install Python dependencies**

   ```bash
   pip install -r backend/requirements.txt
   ```

4. **Configure environment variables** *(optional — defaults work for local dev)*

   ```bash
   cp backend/.env.example backend/.env
   # Edit backend/.env with your preferred values
   ```

5. **Initialise the database**

   The database is created automatically on first run. No manual migration step needed.

---

## Running the Project

### Quickstart (recommended)

```bash
python run.py
```

This will:
- Copy `.env.example` → `.env` if no `.env` is present
- Start the Flask backend on **http://localhost:5000**
- Print a reminder to open `frontend/index.html` in your browser

### Manual start

```bash
cd backend
python app.py
```

Then open `frontend/index.html` directly in your browser (no separate web server required).

---

## Demo Mode

Demo mode is **ON by default** (`DEMO_MODE=True` in `.env`). In demo mode:

- The backend generates realistic simulated sensor readings for all active storage slots.
- No physical ESP32/Arduino hardware is required.
- Data is stored in the database exactly as real data would be — alerts fire, fan commands are issued.

**To disable demo mode** and accept only real IoT device data:

```env
# backend/.env
DEMO_MODE=False
```

Then connect your ESP32 device as described in [ESP32 / Arduino Integration](#esp32--arduino-integration).

---

## API Reference

All API endpoints are prefixed with `/api`. Protected endpoints require a valid user session (cookie-based) obtained via `/auth/login`.

| Method | Endpoint                          | Auth Required | Description                                          |
|--------|-----------------------------------|:-------------:|------------------------------------------------------|
| POST   | `/auth/login`                     | No            | Authenticate user; sets session cookie               |
| POST   | `/auth/logout`                    | Yes           | Invalidate session                                   |
| POST   | `/auth/register`                  | No            | Register a new user account                          |
| GET    | `/api/dashboard`                  | Yes           | Summary: slot count, active alerts, latest readings  |
| GET    | `/api/slots`                      | Yes           | List all storage slots                               |
| POST   | `/api/slots`                      | Yes           | Create a new storage slot                            |
| GET    | `/api/slots/<slot_id>`            | Yes           | Get a single slot's details                          |
| PUT    | `/api/slots/<slot_id>`            | Yes           | Update slot name, crop type, or active status        |
| DELETE | `/api/slots/<slot_id>`            | Yes           | Deactivate (soft-delete) a slot                      |
| GET    | `/api/slots/<slot_id>/status`     | Device Token  | Latest reading + `fan_command` for ESP32 polling     |
| POST   | `/api/sensors/readings`           | Device Token  | Ingest a sensor reading from an IoT device           |
| GET    | `/api/sensors/readings`           | Yes           | Query historical readings (supports `slot_id`, `limit`, `from`, `to` params) |
| GET    | `/api/alerts`                     | Yes           | List active/recent alerts                            |
| POST   | `/api/alerts/<alert_id>/ack`      | Yes           | Acknowledge (dismiss) an alert                       |

**Device Token authentication** — IoT devices send `X-Device-Token: <DEVICE_AUTH_TOKEN>` in the request header instead of a session cookie.

---

## ESP32 / Arduino Integration

See **[docs/ESP32_INTEGRATION.md](docs/ESP32_INTEGRATION.md)** for the complete guide including wiring diagrams, pin configuration, and a ready-to-flash Arduino sketch.

### Quick example — POST a sensor reading

```cpp
#include <HTTPClient.h>
#include <ArduinoJson.h>

void postReading(float temp, float humidity, int gasRaw) {
    HTTPClient http;
    http.begin("http://192.168.1.100:5000/api/sensors/readings");
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", "smartharvest-device-secret-2024");

    StaticJsonDocument<200> doc;
    doc["slot_id"]     = SLOT_ID;
    doc["temperature"] = temp;
    doc["humidity"]    = humidity;
    doc["gas_raw"]     = gasRaw;   // raw ADC — not calibrated ppm

    String body;
    serializeJson(doc, body);

    int code = http.POST(body);
    http.end();
}
```

---

## Database Schema

SmartHarvest uses a single SQLite file (`backend/smartharvest.db`) with the following tables:

| Table           | Description                                                                 |
|-----------------|-----------------------------------------------------------------------------|
| `users`         | Dashboard user accounts (id, username, password_hash, created_at)           |
| `slots`         | Storage slot definitions (id, name, crop_type, active, created_at)          |
| `readings`      | Sensor readings (id, slot_id, temperature, humidity, gas_raw, fan_on, ts)   |
| `alerts`        | Threshold violation records (id, slot_id, type, message, ack, created_at)   |

**Key relationships:**
- `readings.slot_id` → `slots.id`
- `alerts.slot_id` → `slots.id`

The database is initialised automatically on first run via `database.py:init_db()`. No ORM or migration tool is required.

---

## Crop Thresholds

See **[docs/CROP_THRESHOLDS.md](docs/CROP_THRESHOLDS.md)** for the full per-crop threshold reference table.

| Crop        | Temp Range (°C) | Humidity Range (%) | Gas Max (raw ADC) |
|-------------|-----------------|--------------------|--------------------|
| Tomato      | 13 – 25         | 85 – 95            | 500                |
| Onion       | 0 – 10          | 65 – 75            | 600                |
| Potato      | 4 – 10          | 90 – 95            | 600                |
| Apple       | -1 – 4          | 90 – 95            | 400                |
| Mango       | 13 – 15         | 85 – 90            | 500                |
| *… and 15 more* | — | — | — |

> Gas sensor values are **raw uncalibrated ADC readings** from MQ-series sensors (typically 0–1023 on a 10-bit ADC). Field calibration is required for accurate ppm conversion.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| `ModuleNotFoundError: flask` | Dependencies not installed | Run `pip install -r backend/requirements.txt` inside your venv |
| `Address already in use` on port 5000 | Another process using port 5000 | `lsof -i :5000` (Linux/Mac) or `netstat -ano \| findstr 5000` (Windows) and kill the process, or set `FLASK_RUN_PORT=5001` in `.env` |
| Dashboard shows "No slots found" | No slots created yet | Log in and create at least one storage slot via the dashboard |
| ESP32 gets HTTP 401 | Wrong or missing device token | Ensure `X-Device-Token` header matches `DEVICE_AUTH_TOKEN` in `.env` |
| ESP32 gets HTTP 404 on `/api/slots/<id>/status` | Invalid slot ID | Check slot IDs via `GET /api/slots` from the dashboard or Postman |
| Sensor readings look wrong in demo mode | Demo mode simulating data | Set `DEMO_MODE=False` and connect a real device, or adjust simulation range in `app.py` |
| `OperationalError: no such table` | DB not initialised | Delete `smartharvest.db` and restart the app to trigger `init_db()` |
| Gas alert fires immediately | ADC threshold too low for your sensor batch | Increase `gas_max` for that crop in `backend/config.py:CROP_THRESHOLDS` and restart |
| Fan relay stays ON | `fan_command` never goes False | Check that ESP32 polls `/api/slots/<id>/status` and applies the returned `fan_command` |

---

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Make your changes with clear, focused commits
4. Ensure existing functionality still works (run through demo mode)
5. Open a Pull Request with a description of your changes

**Code style:** PEP 8 for Python; 2-space indentation for JavaScript.  
**Issues:** Use GitHub Issues to report bugs or request features.

---

## License

This project is licensed under the **MIT License**. See the `LICENSE` file for details.

---

## Author / Team

| Role               | Name / Handle         |
|--------------------|-----------------------|
| Project Lead       | SmartHarvest Team     |
| Backend Developer  | —                     |
| Frontend Developer | —                     |
| IoT Integration    | —                     |
| Documentation      | —                     |

> Built as part of an IoT-based smart agriculture initiative. For questions, open a GitHub Issue or contact the project team.
