# SmartHarvest – Crop Storage Threshold Reference

> **Note:** Gas sensor thresholds are raw uncalibrated ADC readings from MQ-series sensors.
> Values vary by sensor batch and require field calibration for accurate ppm conversion.

---

## Per-Crop Monitoring Thresholds

| Crop          | Category   | Temp Min (°C) | Temp Max (°C) | Humidity Min (%) | Humidity Max (%) | Gas Threshold (raw) | Notes                                         |
|---------------|------------|:-------------:|:-------------:|:----------------:|:----------------:|:-------------------:|-----------------------------------------------|
| Tomato        | Vegetable  |      13       |      25       |        85        |        95        |        500          | Chill-sensitive; avoid temps below 10 °C      |
| Onion         | Vegetable  |       0       |      10       |        65        |        75        |        600          | Low humidity prevents sprouting & rot         |
| Brinjal       | Vegetable  |      10       |      15       |        85        |        95        |        500          | Chilling injury below 10 °C                   |
| Potato        | Vegetable  |       4       |      10       |        90        |        95        |        600          | Below 4 °C converts starch to sugar           |
| Carrot        | Vegetable  |       0       |       5       |        95        |       100        |        500          | Very high humidity prevents shrivelling       |
| Beetroot      | Vegetable  |       0       |       5       |        95        |       100        |        500          | Similar requirements to carrot                |
| Cabbage       | Vegetable  |       0       |       5       |        90        |        95        |        500          | Ethylene-sensitive; store away from fruits    |
| Cauliflower   | Vegetable  |       0       |       5       |        90        |        95        |        500          | Pre-cool to 0 °C before long-term storage     |
| Beans         | Vegetable  |       5       |      10       |        90        |        95        |        500          | Chilling injury below 5 °C                    |
| Green Chilli  | Vegetable  |       7       |      13       |        90        |        95        |        500          | Chill-sensitive below 7 °C                    |
| Apple         | Fruit      |      -1       |       4       |        90        |        95        |        400          | Produces high ethylene; store separately      |
| Orange        | Fruit      |       3       |       9       |        85        |        90        |        400          | Chill injury possible below 3 °C              |
| Mango         | Fruit      |      13       |      15       |        85        |        90        |        500          | Very chill-sensitive; avoid below 10 °C       |
| Grapes        | Fruit      |      -1       |       2       |        90        |        95        |        400          | SO₂ generators often used in commercial store |
| Strawberry    | Fruit      |       0       |       2       |        90        |        95        |        400          | Extremely perishable; use within 7–10 days    |
| Banana        | Fruit      |      13       |      15       |        85        |        95        |        500          | Chill injury below 13 °C causes skin blackening |
| Papaya        | Fruit      |      10       |      13       |        85        |        90        |        500          | Ripening temp 20–25 °C; cool to slow ripening |
| Pomegranate   | Fruit      |       5       |      10       |        80        |        85        |        500          | Relatively good shelf life under cool storage |
| Guava         | Fruit      |       8       |      10       |        85        |        90        |        500          | Chill-sensitive; skin browning below 8 °C     |
| Watermelon    | Fruit      |      10       |      15       |        85        |        90        |        500          | Chilling injury below 10 °C                   |

---

> ⚠️ **Gas sensor thresholds are raw uncalibrated ADC readings from MQ-series sensors.
> Values vary by sensor batch and require field calibration.**

---

## Default Thresholds Config Block (Python)

Place this in `backend/config.py`. The `default` entry is used when no crop-specific profile is matched.

```python
# Per-crop thresholds: {crop_name_lowercase: {temp_min, temp_max, humidity_min, humidity_max, gas_max}}
# Gas values are raw uncalibrated ADC readings from MQ-series sensors (0–1023 on 10-bit ADC).
# Field calibration is required for accurate ppm conversion.
CROP_THRESHOLDS = {
    'default':        {'temp_min': 10, 'temp_max': 30, 'humidity_min': 40, 'humidity_max': 80,  'gas_max': 600},
    'tomato':         {'temp_min': 13, 'temp_max': 25, 'humidity_min': 85, 'humidity_max': 95,  'gas_max': 500},
    'onion':          {'temp_min': 0,  'temp_max': 10, 'humidity_min': 65, 'humidity_max': 75,  'gas_max': 600},
    'brinjal':        {'temp_min': 10, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 95,  'gas_max': 500},
    'potato':         {'temp_min': 4,  'temp_max': 10, 'humidity_min': 90, 'humidity_max': 95,  'gas_max': 600},
    'carrot':         {'temp_min': 0,  'temp_max': 5,  'humidity_min': 95, 'humidity_max': 100, 'gas_max': 500},
    'beetroot':       {'temp_min': 0,  'temp_max': 5,  'humidity_min': 95, 'humidity_max': 100, 'gas_max': 500},
    'cabbage':        {'temp_min': 0,  'temp_max': 5,  'humidity_min': 90, 'humidity_max': 95,  'gas_max': 500},
    'cauliflower':    {'temp_min': 0,  'temp_max': 5,  'humidity_min': 90, 'humidity_max': 95,  'gas_max': 500},
    'beans':          {'temp_min': 5,  'temp_max': 10, 'humidity_min': 90, 'humidity_max': 95,  'gas_max': 500},
    'green chilli':   {'temp_min': 7,  'temp_max': 13, 'humidity_min': 90, 'humidity_max': 95,  'gas_max': 500},
    'apple':          {'temp_min': -1, 'temp_max': 4,  'humidity_min': 90, 'humidity_max': 95,  'gas_max': 400},
    'orange':         {'temp_min': 3,  'temp_max': 9,  'humidity_min': 85, 'humidity_max': 90,  'gas_max': 400},
    'mango':          {'temp_min': 13, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 90,  'gas_max': 500},
    'grapes':         {'temp_min': -1, 'temp_max': 2,  'humidity_min': 90, 'humidity_max': 95,  'gas_max': 400},
    'strawberry':     {'temp_min': 0,  'temp_max': 2,  'humidity_min': 90, 'humidity_max': 95,  'gas_max': 400},
    'banana':         {'temp_min': 13, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 95,  'gas_max': 500},
    'papaya':         {'temp_min': 10, 'temp_max': 13, 'humidity_min': 85, 'humidity_max': 90,  'gas_max': 500},
    'pomegranate':    {'temp_min': 5,  'temp_max': 10, 'humidity_min': 80, 'humidity_max': 85,  'gas_max': 500},
    'guava':          {'temp_min': 8,  'temp_max': 10, 'humidity_min': 85, 'humidity_max': 90,  'gas_max': 500},
    'watermelon':     {'temp_min': 10, 'temp_max': 15, 'humidity_min': 85, 'humidity_max': 90,  'gas_max': 500},
}
```
