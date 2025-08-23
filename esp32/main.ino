/*Copyright [2025] [Amartya Roy]

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.*/


#include <WiFi.h>
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include "mbedtls/aes.h"
#include "mbedtls/base64.h"

// ---------- WiFi / MQTT ----------
const char* ssid = "YOUR_WIFI_ID";
const char* password = "YOUR_WIFI_PASSWORD";

const char* mqtt_server = "MQTT_BROKER_IP";
const int mqtt_port = 1883;
const char* mqtt_user = "REGISTERED_ID_IN_WALLET";
const char* mqtt_password = "REGISTERED_PASSWORD_FOR_THE_ID";

WiFiClient espClient;
PubSubClient client(espClient);

// ---------- Encryption key (same as you had) ----------
uint8_t aes_key[16] = {
  0x2B, 0x7E, 0x15, 0x16, 0x28, 0xAE, 0xD2, 0xA6,
  0xAB, 0xF7, 0x12, 0x6A, 0xF5, 0x8B, 0x3C, 0x1F
};

String deviceMac;
String clientId;


// ---------- Forward declarations ----------
void callback(char* topic, byte* payload, unsigned int length);
void reconnect();
String encryptAndBase64Encode(const char* plainText);

// ---------- WiFi setup ----------
void setup_wifi() {
  delay(10);
  Serial.println();
  Serial.print("Connecting to ");
  Serial.println(ssid);

  WiFi.begin(ssid, password);

  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println("\nWiFi connected");
  Serial.print("IP address: ");
  Serial.println(WiFi.localIP());

  deviceMac = WiFi.macAddress();
  Serial.print("Device MAC Address: ");
  Serial.println(deviceMac);
}


// ---------- MQTT reconnect ----------
void reconnect() {
  while (!client.connected()) {
    Serial.print("Attempting MQTT connection...");
    clientId = "ESP32Client-" + String(random(1000, 9999));
    if (client.connect(clientId.c_str(), mqtt_user, mqtt_password)) {
      Serial.println("connected with Client ID: " + clientId);
    } else {
      Serial.print("failed, rc=");
      Serial.print(client.state());
      Serial.println(" try again in 5 seconds");
      delay(5000);
    }
  }
}

// ---------- AES-ECB + Base64 encrypt function (uses heap buffers) ----------
String encryptAndBase64Encode(const char* plainText) {
  mbedtls_aes_context aes;
  mbedtls_aes_init(&aes);
  mbedtls_aes_setkey_enc(&aes, aes_key, 128);

  int len = strlen(plainText);
  int paddedLen = (len % 16 == 0) ? len : (len + (16 - len % 16));

  // Allocate on heap to avoid VLA issues
  uint8_t* input = (uint8_t*)malloc(paddedLen);
  if (!input) {
    Serial.println("malloc input failed");
    return String("");
  }
  memset(input, 0, paddedLen);
  memcpy(input, plainText, len);

  uint8_t* output = (uint8_t*)malloc(paddedLen);
  if (!output) {
    Serial.println("malloc output failed");
    free(input);
    return String("");
  }

  for (int i = 0; i < paddedLen; i += 16) {
    mbedtls_aes_crypt_ecb(&aes, MBEDTLS_AES_ENCRYPT, input + i, output + i);
  }

  // Base64 buffer size: ceil(paddedLen/3)*4 + 1
  size_t b64buflen = ((paddedLen + 2) / 3) * 4 + 1;
  unsigned char* b64output = (unsigned char*)malloc(b64buflen);
  if (!b64output) {
    Serial.println("malloc b64output failed");
    free(input);
    free(output);
    return String("");
  }
  size_t out_len = 0;
  int ret = mbedtls_base64_encode(b64output, b64buflen, &out_len, output, paddedLen);
  if (ret != 0) {
    Serial.print("mbedtls_base64_encode failed: ");
    Serial.println(ret);
    free(input);
    free(output);
    free(b64output);
    mbedtls_aes_free(&aes);
    return String("");
  }

  // Ensure null termination
  b64output[out_len] = '\0';
  String result = String((char*)b64output);

  // cleanup
  free(input);
  free(output);
  free(b64output);
  mbedtls_aes_free(&aes);

  return result;
}

// ---------- Setup and loop ----------
void setup() {
  Serial.begin(115200);
  delay(10);
  randomSeed(analogRead(0));

  setup_wifi();

  client.setServer(mqtt_server, mqtt_port);
}

void loop() {
  if (!client.connected()) {
    reconnect();
  }
  client.loop();

  // Generate Random Data
  int spo2 = random(80, 100);
  int heartRate = random(50, 120);

  // JSON Payload for Health Data
  StaticJsonDocument<128> doc;
  doc["spo2"] = spo2;
  doc["heartRate"] = heartRate;
  // Optionally include an id field for traceability:
  // doc["id"] = String(random(100000,999999));

  char jsonPayload[128];
  serializeJson(doc, jsonPayload);

  Serial.print("Plain Payload: ");
  Serial.println(jsonPayload);

  // Encrypt Health Data
  String encryptedData = encryptAndBase64Encode(jsonPayload);

  // Encrypt Device ID (MAC Address)
  String encryptedDeviceId = encryptAndBase64Encode(deviceMac.c_str());

  Serial.print("Encrypted Device ID: ");
  Serial.println(encryptedDeviceId);

  Serial.print("Encrypted Data: ");
  Serial.println(encryptedData);

  // Final JSON to Send
  StaticJsonDocument<256> finalDoc;
  finalDoc["deviceId"] = encryptedDeviceId;
  finalDoc["encryptedData"] = encryptedData;

  char finalPayload[256];
  serializeJson(finalDoc, finalPayload);

  client.publish("esp32/healthdata", finalPayload /*retain=*/false);
  Serial.print("Final Payload sent: ");
  Serial.println(finalPayload);

  delay(10000);  // Every 10 seconds
}
