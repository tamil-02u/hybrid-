# ESP32 / Arduino Integration Guide — SmartHarvest

This document describes how to wire, configure, and flash an ESP32 (or compatible Arduino) board to stream sensor data to the SmartHarvest backend and receive automated fan-relay commands.

---

## Table of Contents

1. [Required Libraries](#required-libraries)
2. [Hardware Configuration](#hardware-configuration)
3. [Pin Configuration Table](#pin-configuration-table)
4. [Wiring Diagram](#wiring-diagram)
5. [Complete Arduino Sketch](#complete-arduino-sketch)
6. [Testing Without Hardware (Demo Mode)](#testing-without-hardware-demo-mode)
7. [Troubleshooting](#troubleshooting)

---

## Required Libraries

Install these libraries via the **Arduino IDE Library Manager** (`Sketch → Include Library → Manage Libraries…`) or PlatformIO:

| Library           | Version  | Purpose                                             |
|-------------------|----------|-----------------------------------------------------|
| **WiFi**          | Built-in | ESP32 Wi-Fi connectivity (bundled with ESP32 core)  |
| **HTTPClient**    | Built-in | HTTP POST/GET to the SmartHarvest API               |
| **ArduinoJson**   | 6.x      | Serialize/deserialize JSON payloads                 |
| **DHT sensor library** | 1.4.x | Read temperature & humidity from DHT22            |
| **Adafruit Unified Sensor** | — | Dependency for the DHT library               |

**Install ArduinoJson:**
```
Library Manager → search "ArduinoJson" by Benoit Blanchon → Install 6.x
```

**Install DHT library:**
```
Library Manager → search "DHT sensor library" by Adafruit → Install
```

---

## Hardware Configuration

Open the sketch and update the `CONFIG` section at the top before flashing:

```cpp
// ─── USER CONFIGURATION ────────────────────────────────────────────────────
const char* WIFI_SSID       = "YourWiFiNetwork";
const char* WIFI_PASSWORD   = "YourWiFiPassword";

const char* API_BASE_URL    = "http://192.168.1.100:5000";  // Backend IP:port
const char* DEVICE_TOKEN    = "smartharvest-device-secret-2024"; // Must match DEVICE_AUTH_TOKEN in .env
const int   SLOT_ID         = 1;                             // Storage slot ID assigned in the dashboard
// ───────────────────────────────────────────────────────────────────────────
```

> ⚠️ **DEVICE_TOKEN** must exactly match the `DEVICE_AUTH_TOKEN` value in `backend/.env`. The default is `smartharvest-device-secret-2024`.

---

## Pin Configuration Table

| Signal              | ESP32 GPIO | Notes                                       |
|---------------------|:----------:|---------------------------------------------|
| DHT22 Data          |    GPIO 4  | 10 kΩ pull-up to 3.3 V recommended          |
| MQ-2 / MQ-135 AOUT |   GPIO 34  | Analog input only (ADC1); connect to AOUT   |
| Fan Relay IN        |   GPIO 26  | HIGH = relay ON (fan running)               |
| DHT22 VCC           |   3.3 V    | Some modules support 5 V — check your board |
| DHT22 GND           |    GND     | —                                           |
| MQ sensor VCC       |    5 V     | MQ sensors require 5 V for heater           |
| MQ sensor GND       |    GND     | —                                           |
| Relay VCC           |    5 V     | Relay module coil typically needs 5 V       |
| Relay GND           |    GND     | —                                           |

> ⚠️ ESP32 ADC pins are **3.3 V max**. Use a voltage divider if the MQ sensor's AOUT exceeds 3.3 V.

---

## Wiring Diagram

```
                         ┌─────────────────────────────────┐
                         │           ESP32 DevKit           │
                         │                                 │
  DHT22                  │  3.3V ──────────────── DHT22 VCC│
  ┌──────┐               │  GND  ──────────────── DHT22 GND│
  │ VCC  │──── 3.3V      │  GPIO4 ─────────────── DHT22 DAT│
  │ DATA │──── GPIO4     │                                 │
  │ NC   │               │  5V   ──────────────── MQ VCC   │
  │ GND  │──── GND       │  GND  ──────────────── MQ GND   │
  └──────┘               │  GPIO34 ───────────── MQ AOUT   │
                         │                                 │
  MQ-2 / MQ-135          │  5V   ──────────────── Relay VCC│
  ┌──────┐               │  GND  ──────────────── Relay GND│
  │ VCC  │──── 5V        │  GPIO26 ───────────── Relay IN  │
  │ AOUT │──── GPIO34    │                                 │
  │ DOUT │  (not used)   └─────────────────────────────────┘
  │ GND  │──── GND
  └──────┘                         │ Relay COM/NO
                                   │ connects to fan
  Fan Relay Module                 │ power circuit
  ┌──────────┐
  │ VCC      │──── 5V
  │ GND      │──── GND
  │ IN       │──── GPIO26
  │ COM      │──── [Fan +]
  │ NO       │──── [Power +]
  └──────────┘
```

---

## Complete Arduino Sketch

Copy the entire sketch below into a new `.ino` file in the Arduino IDE.

```cpp
/**
 * SmartHarvest ESP32 Sensor Node
 * ---------------------------------
 * Reads DHT22 (temperature + humidity) and MQ-series gas sensor,
 * POSTs readings to the SmartHarvest API every 5 seconds, and
 * polls for fan relay commands.
 *
 * NOTE: MQ sensor values are RAW ADC readings (0–4095 on ESP32 12-bit ADC).
 * They are NOT calibrated ppm values. Field calibration is required
 * before interpreting them as gas concentrations.
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <DHT.h>

// ─── USER CONFIGURATION ────────────────────────────────────────────────────
const char* WIFI_SSID       = "YourWiFiNetwork";
const char* WIFI_PASSWORD   = "YourWiFiPassword";

const char* API_BASE_URL    = "http://192.168.1.100:5000";  // SmartHarvest backend
const char* DEVICE_TOKEN    = "smartharvest-device-secret-2024";
const int   SLOT_ID         = 1;
// ───────────────────────────────────────────────────────────────────────────

// ─── PIN DEFINITIONS ───────────────────────────────────────────────────────
#define DHT_PIN       4       // DHT22 data pin
#define DHT_TYPE      DHT22   // Sensor type
#define GAS_PIN       34      // MQ-2 / MQ-135 analog out (ADC1)
#define FAN_RELAY_PIN 26      // Fan relay control (HIGH = ON)
// ───────────────────────────────────────────────────────────────────────────

// ─── TIMING ────────────────────────────────────────────────────────────────
const unsigned long POST_INTERVAL_MS  = 5000;  // POST reading every 5 s
const unsigned long FAN_POLL_MS       = 5000;  // Poll fan command every 5 s
// ───────────────────────────────────────────────────────────────────────────

DHT dht(DHT_PIN, DHT_TYPE);

unsigned long lastPostTime = 0;
unsigned long lastFanPoll  = 0;
bool          fanOn        = false;

// ─── WiFi ──────────────────────────────────────────────────────────────────

void connectWiFi() {
    Serial.printf("\n[WiFi] Connecting to %s", WIFI_SSID);
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED) {
        delay(500);
        Serial.print(".");
        if (millis() - start > 15000) {
            Serial.println("\n[WiFi] Timeout — retrying in 5 s");
            delay(5000);
            WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
            start = millis();
        }
    }
    Serial.printf("\n[WiFi] Connected — IP: %s\n", WiFi.localIP().toString().c_str());
}

void ensureWiFi() {
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("[WiFi] Disconnected — reconnecting...");
        connectWiFi();
    }
}

// ─── Sensor Reads ──────────────────────────────────────────────────────────

float readTemperature() {
    float t = dht.readTemperature();
    if (isnan(t)) {
        Serial.println("[DHT] Temperature read failed");
        return -999.0;
    }
    return t;
}

float readHumidity() {
    float h = dht.readHumidity();
    if (isnan(h)) {
        Serial.println("[DHT] Humidity read failed");
        return -999.0;
    }
    return h;
}

int readGasRaw() {
    // RAW ADC value (0–4095 on ESP32 12-bit ADC).
    // NOT calibrated ppm — do not interpret as gas concentration without calibration.
    return analogRead(GAS_PIN);
}

// ─── POST Sensor Reading ───────────────────────────────────────────────────

void postReading(float temperature, float humidity, int gasRaw) {
    if (temperature == -999.0 || humidity == -999.0) {
        Serial.println("[POST] Skipping — invalid sensor data");
        return;
    }

    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/sensors/readings";
    http.begin(url);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-Device-Token", DEVICE_TOKEN);

    // Build JSON payload
    StaticJsonDocument<256> doc;
    doc["slot_id"]     = SLOT_ID;
    doc["temperature"] = temperature;
    doc["humidity"]    = humidity;
    // gas_raw is a RAW ADC value, not calibrated ppm
    doc["gas_raw"]     = gasRaw;
    doc["fan_on"]      = fanOn;

    String payload;
    serializeJson(doc, payload);

    Serial.printf("[POST] %s  body=%s\n", url.c_str(), payload.c_str());

    int httpCode = http.POST(payload);
    if (httpCode > 0) {
        Serial.printf("[POST] Response: %d\n", httpCode);
        if (httpCode != 200 && httpCode != 201) {
            Serial.printf("[POST] Body: %s\n", http.getString().c_str());
        }
    } else {
        Serial.printf("[POST] Error: %s\n", http.errorToString(httpCode).c_str());
    }
    http.end();
}

// ─── Fan Command Poll ──────────────────────────────────────────────────────

void pollFanCommand() {
    HTTPClient http;
    String url = String(API_BASE_URL) + "/api/slots/" + String(SLOT_ID) + "/status";
    http.begin(url);
    http.addHeader("X-Device-Token", DEVICE_TOKEN);

    Serial.printf("[FAN POLL] GET %s\n", url.c_str());

    int httpCode = http.GET();
    if (httpCode == 200) {
        String body = http.getString();
        StaticJsonDocument<256> resp;
        DeserializationError err = deserializeJson(resp, body);
        if (err) {
            Serial.printf("[FAN POLL] JSON parse error: %s\n", err.c_str());
        } else {
            // fan_command: true = turn fan ON, false = turn fan OFF
            bool command = resp["fan_command"] | false;
            if (command != fanOn) {
                fanOn = command;
                digitalWrite(FAN_RELAY_PIN, fanOn ? HIGH : LOW);
                Serial.printf("[FAN] Relay set to %s\n", fanOn ? "ON" : "OFF");
            }
        }
    } else {
        Serial.printf("[FAN POLL] HTTP error: %d\n", httpCode);
    }
    http.end();
}

// ─── Setup ─────────────────────────────────────────────────────────────────

void setup() {
    Serial.begin(115200);
    delay(100);

    Serial.println("\n========================================");
    Serial.println("  SmartHarvest ESP32 Sensor Node");
    Serial.println("========================================");

    // Configure pins
    pinMode(FAN_RELAY_PIN, OUTPUT);
    digitalWrite(FAN_RELAY_PIN, LOW);  // Fan OFF at boot

    // Start DHT sensor
    dht.begin();
    Serial.println("[DHT] Sensor initialised");

    // Connect to WiFi
    connectWiFi();

    Serial.println("[BOOT] Setup complete — entering main loop");
}

// ─── Loop ──────────────────────────────────────────────────────────────────

void loop() {
    unsigned long now = millis();

    // Reconnect WiFi if dropped
    ensureWiFi();

    // POST sensor reading every POST_INTERVAL_MS
    if (now - lastPostTime >= POST_INTERVAL_MS) {
        lastPostTime = now;

        float temp     = readTemperature();
        float humidity = readHumidity();
        int   gasRaw   = readGasRaw();  // RAW ADC — not calibrated ppm

        Serial.printf("[SENSOR] Temp=%.1f°C  Humidity=%.1f%%  Gas(raw)=%d\n",
                      temp, humidity, gasRaw);

        postReading(temp, humidity, gasRaw);
    }

    // Poll fan command every FAN_POLL_MS
    if (now - lastFanPoll >= FAN_POLL_MS) {
        lastFanPoll = now;
        pollFanCommand();
    }
}
```

---

## Testing Without Hardware (Demo Mode)

You do **not** need physical hardware to test SmartHarvest:

1. Ensure the backend is started with `DEMO_MODE=True` (the default).
2. Open `frontend/index.html` in your browser and log in.
3. The backend automatically generates simulated temperature, humidity, and gas readings for all active slots every `SENSOR_POLL_INTERVAL` seconds.
4. Alerts, fan commands, and chart data all behave identically to real hardware.

To **simulate a specific scenario** (e.g., high temperature alert), temporarily edit the simulation range in `backend/app.py` demo mode section.

---

## Troubleshooting

| Problem | Likely Cause | Fix |
|---------|-------------|-----|
| ESP32 keeps reconnecting | Weak Wi-Fi signal or wrong credentials | Move closer to router; double-check `WIFI_SSID` / `WIFI_PASSWORD` |
| HTTP 401 on POST | Wrong device token | `DEVICE_TOKEN` in sketch must match `DEVICE_AUTH_TOKEN` in `backend/.env` |
| HTTP 404 on slot status | Invalid `SLOT_ID` | Check slot IDs via `GET /api/slots` (login required) |
| DHT reads `nan` | Loose wiring or missing pull-up | Add a 10 kΩ resistor between DHT DATA and 3.3 V; check soldering |
| Gas value always 0 | Wrong ADC pin or wiring | ESP32 ADC1 pins: 32–39. Confirm GAS_PIN uses an ADC1 pin |
| Gas value always 4095 | MQ sensor output > 3.3 V | Add voltage divider (e.g., 10 kΩ + 20 kΩ) on AOUT line |
| Fan relay never toggles | `fan_command` not changing | Verify backend threshold logic; check that slot has correct crop type set |
| `http.POST()` returns -1 | Network unreachable | Confirm API_BASE_URL IP; ensure backend is running and accessible on LAN |
