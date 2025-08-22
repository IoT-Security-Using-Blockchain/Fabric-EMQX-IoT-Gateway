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



const express = require('express');
const bodyParser = require('body-parser');
const { Wallets, Gateway } = require('fabric-network');
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const crypto = require('crypto');

const app = express();
const PORT = 3000;

app.use(bodyParser.json());

// AES-128 Key (must match ESP32 exactly)
const aesKey = Buffer.from([
    0x2B, 0x7E, 0x15, 0x16, 0x28, 0xAE, 0xD2, 0xA6,
    0xAB, 0xF7, 0x12, 0x6A, 0xF5, 0x8B, 0x3C, 0x1F
]);

// AES-128 ECB Base64 Decrypt (Zero Padding)
function decryptBase64AesEcb(base64CipherText) {
    const encryptedBuffer = Buffer.from(base64CipherText, 'base64');
    const decipher = crypto.createDecipheriv('aes-128-ecb', aesKey, null);
    decipher.setAutoPadding(false);

    let decrypted = decipher.update(encryptedBuffer);
    decrypted = Buffer.concat([decrypted, decipher.final()]);

    // Remove null padding
    return decrypted.toString('utf8').replace(/\x00+$/, '');
}

// Replace with your actual MQTT broker IP accessible by ESP32!
const MQTT_BROKER_IP = '192.168.0.104';

const client = mqtt.connect(`mqtt://${MQTT_BROKER_IP}:1883`, {
    clientId: 'serverNodeClient',
    clean: true,
    reconnectPeriod: 1000,
    connectTimeout: 30 * 1000,
    // username: 'your_username', // if needed
    // password: 'your_password', // if needed
});

client.on('connect', () => {
    console.log('✅ Connected to MQTT Broker');
    client.subscribe('esp32/healthdata', (err) => {
        if (err) console.error('❌ Subscription error:', err);
        else console.log('📡 Subscribed to topic: esp32/healthdata');
    });
});

client.on('error', (err) => {
    console.error('❌ MQTT Client Error:', err);
});

client.on('message', async (topic, message) => {
    console.log(`📥 Incoming MQTT message on ${topic}: ${message.toString()}`);

    let data;
    try {
        data = JSON.parse(message.toString());
    } catch {
        console.error('❌ Invalid JSON payload');
        return;
    }

    const { deviceId, encryptedData } = data;
    if (!deviceId || !encryptedData) {
        console.error('❌ Missing deviceId or encryptedData in payload');
        return;
    }

    try {
        // Decrypt fields
        const decryptedDeviceId = decryptBase64AesEcb(deviceId);
        const decryptedPayload = decryptBase64AesEcb(encryptedData);

        console.log(`🔓 Decrypted Device ID: ${decryptedDeviceId}`);
        console.log(`🔓 Decrypted Payload: ${decryptedPayload}`);

        const healthData = JSON.parse(decryptedPayload);
        const { spo2, heartRate } = healthData;

        console.log(`❤️ SPO2: ${spo2}, Heart Rate: ${heartRate}`);

        const assetID = `${decryptedDeviceId}_${Date.now()}`;
        const owner = decryptedDeviceId;

        console.log('📝 Preparing to invoke chaincode:', {
            assetID,
            owner,
            spo2,
            heartRate
        });

        // Fabric Network Setup
        const ccpPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        const wallet = await Wallets.newFileSystemWallet('./wallet');
        const identity = await wallet.get('esp32');
        if (!identity) {
            console.error('❌ ESP32 identity not found in wallet');
            return;
        }

        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: 'esp32',
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('basic');

        // Submit to ledger
        await contract.submitTransaction('CreateHealthAsset', assetID, owner, spo2.toString(), heartRate.toString());
        console.log(`✅ Health Asset ${assetID} Created Successfully`);

        // Query the just-written asset from ledger
        try {
            const result = await contract.evaluateTransaction('ReadHealthAsset', assetID);
            const assetData = JSON.parse(result.toString());

            console.log('📄 Asset from Ledger:', assetData);

            // Check values (handle case sensitivity)
            const spo2Value = Number(assetData.SPO2 ?? assetData.spo2);
            const heartRateValue = Number(assetData.HeartRate ?? assetData.heartRate);

            if (spo2Value < 90 || heartRateValue < 60) {
                const warningPayload = JSON.stringify({
                    alert: 'HEALTH_WARNING',
                    spo2: spo2Value,
                    heartRate: heartRateValue
                });

                console.log('⚠️ Warning condition detected — publishing to ESP32:', warningPayload);

                if (client.connected) {
                    client.publish('esp32/warning', warningPayload, { qos: 1 }, (err) => {
                        if (err) {
                            console.error('❌ MQTT publish error:', err);
                        } else {
                            console.log('⚠️ Warning published to ESP32 on topic esp32/warning');
                        }
                    });
                } else {
                    console.error('❌ MQTT client not connected, cannot publish warning');
                }
            } else {
                console.log('✅ Health parameters normal, no warning published');
            }
        } catch (err) {
            console.error('❌ Failed to read asset from ledger:', err);
        }

        await gateway.disconnect();

    } catch (error) {
        console.error(`❌ Processing Failed: ${error}`);
    }
});

// Authentication API
let isEsp32Authenticated = false;
let emptyAuthAttemptCount = 0;

app.post('/api/authentication', async (req, res) => {
    const { username, password } = req.body;

    if (isEsp32Authenticated) {
        return res.json({ result: 'allow', is_superuser: false });
    }

    if (!username || !password) {
        emptyAuthAttemptCount++;
        if (emptyAuthAttemptCount % 10 === 1) {
            console.log(`❌ Authentication attempt with empty credentials (Count: ${emptyAuthAttemptCount})`);
        }
        return res.json({ result: 'deny' });
    }

    if (username !== 'esp32' || password !== 'esp32pw') {
        console.log('❌ Authentication failed');
        return res.json({ result: 'deny' });
    }

    const wallet = await Wallets.newFileSystemWallet('./wallet');
    const identity = await wallet.get('esp32');

    if (identity) {
        console.log(`✅ ESP32 authenticated`);
        isEsp32Authenticated = true;
        return res.json({ result: 'allow', is_superuser: false });
    } else {
        console.log(`❌ ESP32 Identity not found in wallet`);
        return res.json({ result: 'deny' });
    }
});

// Query Ledger API
app.get('/api/query-health-data', async (req, res) => {
    try {
        const ccpPath = path.resolve(__dirname, '..', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        const wallet = await Wallets.newFileSystemWallet('./wallet');
        const identity = await wallet.get('esp32');
        if (!identity) throw new Error('ESP32 identity not found in wallet');

        const gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet,
            identity: 'esp32',
            discovery: { enabled: true, asLocalhost: true }
        });

        const network = await gateway.getNetwork('mychannel');
        const contract = network.getContract('basic');

        const result = await contract.evaluateTransaction('GetAllHealthAssets');
        console.log(`📦 Query Result: ${result.toString()}`);

        await gateway.disconnect();
        res.json({ data: JSON.parse(result.toString()) });

    } catch (error) {
        console.error(`❌ Failed to query assets: ${error}`);
        res.status(500).json({ error: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Server listening on port ${PORT}`);
});
