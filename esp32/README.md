# 🚀 ESP32 Secure MQTT Client
This folder contains the ESP32 source code for publishing health monitoring data securely to the EMQX MQTT Broker, with AES encryption applied on the payload before transmission.

>The ESP32 acts as an IoT edge device in the Fabric-EMQX IoT Gateway system.


## 🔑 Features
- 📡 MQTT Communication with EMQX broker

- 🔒 AES Encryption on payload data (SPO2, Heart Rate, Device ID)

- 🆔 Device Identity tied to Fabric CA registration

- ⚡ Lightweight and optimized for ESP32


## 🛠️ Requirements
- ESP32 board

- Arduino IDE / PlatformIO

- Libraries:

    - WiFi.h

    - PubSubClient.h

    - ArduinoJson.h

    - mbedtls/aes.h (for AES encryption)


## ⚙️ How it Works
- ESP32 connects to WiFi

- Device publishes encrypted payload → EMQX broker

- EMQX authenticates device against Fabric CA

- Decrypted & validated data is pushed to Hyperledger Fabric ledger


### Example Payload (before encryption)
```json
{
  "deviceId": "ESP32-MAC-ADDR",
  "spo2": 95,
  "heartRate": 78
}
```

### 🔐 Encrypted Payload Sent
```bash
Base64(AES(ciphertext))
```

## ▶️ Setup Instructions
1. Go the esp32 folder
```bash
cd Fabric-EMQX-IoT-Gateway/esp32
```
2. Open main.ino in **Arduino IDE**

3. Update WiFi & Broker credentials:
    ```markdown
    const char* ssid = "YOUR_WIFI";
    const char* password = "YOUR_PASS";
    const char* mqtt_server = "BROKER_IP";
    const char* mqtt_username = "YOUR_REGISTERED_ID";
    const char* mqtt_password = "YOUR_REGISTERED_PASSWORD";
    ```

4. Flash the code to ESP32

5. Monitor serial output for connection & publishing


> 📖 For the complete system workflow, see the [Main Project README](../README.md).
 