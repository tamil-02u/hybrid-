import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.getenv('SECRET_KEY', 'smartharvest-dev-secret-change-in-production')
    DATABASE_PATH = os.path.join(os.path.dirname(__file__), 'smartharvest.db')
    DEMO_MODE = os.getenv('DEMO_MODE', 'True').lower() == 'true'
    DEVICE_AUTH_TOKEN = os.getenv('DEVICE_AUTH_TOKEN', 'smartharvest-device-secret-2024')
    SENSOR_POLL_INTERVAL = int(os.getenv('SENSOR_POLL_INTERVAL', '5'))
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = 'Lax'

# Per-crop thresholds: {crop_name_lowercase: {temp_min, temp_max, humidity_min, humidity_max, gas_max}}
# Gas values are raw uncalibrated ADC readings from MQ-series sensors (0–1023 on 10-bit ADC).
# Field calibration is required for accurate ppm conversion.
CROP_THRESHOLDS = {
    'default':        {'temp_min': 10, 'temp_max': 30, 'humidity_min': 40, 'humidity_max': 80, 'gas_max': 600},
    'tomato':         {'temp_min': 13, 'temp_max': 25, 'humidity_min': 85, 'humidity_max': 95, 'gas_max': 500},
    'onion':          {'temp_min': 0,  'temp_max': 10, 'humidity_min': 65, 'humidity_max': 75, 'gas_max': 600},
    'brinjal':        {'temp_min': 10, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 95, 'gas_max': 500},
    'potato':         {'temp_min': 4,  'temp_max': 10, 'humidity_min': 90, 'humidity_max': 95, 'gas_max': 600},
    'carrot':         {'temp_min': 0,  'temp_max': 5,  'humidity_min': 95, 'humidity_max': 100,'gas_max': 500},
    'beetroot':       {'temp_min': 0,  'temp_max': 5,  'humidity_min': 95, 'humidity_max': 100,'gas_max': 500},
    'cabbage':        {'temp_min': 0,  'temp_max': 5,  'humidity_min': 90, 'humidity_max': 95, 'gas_max': 500},
    'cauliflower':    {'temp_min': 0,  'temp_max': 5,  'humidity_min': 90, 'humidity_max': 95, 'gas_max': 500},
    'beans':          {'temp_min': 5,  'temp_max': 10, 'humidity_min': 90, 'humidity_max': 95, 'gas_max': 500},
    'green chilli':   {'temp_min': 7,  'temp_max': 13, 'humidity_min': 90, 'humidity_max': 95, 'gas_max': 500},
    'apple':          {'temp_min': -1, 'temp_max': 4,  'humidity_min': 90, 'humidity_max': 95, 'gas_max': 400},
    'orange':         {'temp_min': 3,  'temp_max': 9,  'humidity_min': 85, 'humidity_max': 90, 'gas_max': 400},
    'mango':          {'temp_min': 13, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 90, 'gas_max': 500},
    'grapes':         {'temp_min': -1, 'temp_max': 2,  'humidity_min': 90, 'humidity_max': 95, 'gas_max': 400},
    'strawberry':     {'temp_min': 0,  'temp_max': 2,  'humidity_min': 90, 'humidity_max': 95, 'gas_max': 400},
    'banana':         {'temp_min': 13, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 95, 'gas_max': 500},
    'papaya':         {'temp_min': 10, 'temp_max': 13, 'humidity_min': 85, 'humidity_max': 90, 'gas_max': 500},
    'pomegranate':    {'temp_min': 5,  'temp_max': 10, 'humidity_min': 80, 'humidity_max': 85, 'gas_max': 500},
    'guava':          {'temp_min': 8,  'temp_max': 10, 'humidity_min': 85, 'humidity_max': 90, 'gas_max': 500},
    'watermelon':     {'temp_min': 10, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 90, 'gas_max': 500},
}
