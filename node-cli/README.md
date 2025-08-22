# 🚀 Node.js CLI for Fabric CA Device Management
This folder contains the Node.js CLI utilities for managing device identities with Hyperledger Fabric CA and running the backend server for recording device data on the ledger.

## 📌 Features
- ✅ Register new IoT devices (e.g., ESP32) with Fabric CA

- ✅ Automatically add device identities to the Fabric wallet

- ✅ Run a server to accept ESP32 payloads and push them to the blockchain

- ✅ Keep a record of registered identities (default: admin.id)


## ⚙️ Prerequisites
- Node.js (>= 16.x recommended)

- Hyperledger Fabric test network running

- Fabric CA set up (refer to [Fabric Network Setup Guide](https://github.com/IoT-Security-Using-Blockchain/Secure-IoMT-Edge-Data-via-Hyperledger-Fabric)
)

- fabric-network and fabric-ca-client npm modules


## 🛠️ Installation
```bash
cd node-cli
npm install
```

## 🚀 Usage
### 1️⃣ Register a New Device Identity
```bash
node registerDevice.js
```

This will:

- Register the device with Fabric CA

- Store credentials in the Fabric wallet

- Add the identity to admin.id file automatically


### 2️⃣ Run the Server
```bash
node server.js
```

- Starts an HTTP server

- Accepts ESP32 encrypted payloads

- Invokes Fabric chaincode to store the data


## 🔗 Related Docs
📖 For complete project workflow, see the [Main Project README](../README.md)
