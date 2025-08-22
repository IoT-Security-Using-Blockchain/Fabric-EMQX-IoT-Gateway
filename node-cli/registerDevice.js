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



const inquirer = require('inquirer');
const FabricCAServices = require('fabric-ca-client');
const { Wallets, X509Identity } = require('fabric-network');
const fs = require('fs-extra');
const path = require('path');

const caURL = 'https://localhost:7054';
const mspOrg1 = 'Org1MSP';
const walletPath = path.join(__dirname, './wallet');

async function main() {
    const wallet = await Wallets.newFileSystemWallet(walletPath);
    await enrollAdmin(wallet);

    while (true) {
        const answers = await inquirer.prompt([
            {
                type: 'list',
                name: 'action',
                message: 'Choose an action:',
                choices: ['Register/Enroll Device', 'List Enrolled Devices', 'Exit']
            }
        ]);

        if (answers.action === 'Register/Enroll Device') {
            await registerOrReenrollDevice(wallet);
        } else if (answers.action === 'List Enrolled Devices') {
            await listDevices(wallet);
        } else if (answers.action === 'Exit') {
            console.log('Exiting Device Manager...');
            process.exit(0);
        }
    }
}

async function enrollAdmin(wallet) {
    const ca = new FabricCAServices(caURL);
    console.log('Enrolling admin (will overwrite if exists)...');

    try {
        const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });

        const identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes()
            },
            mspId: mspOrg1,
            type: 'X.509'
        };

        await wallet.put('admin', identity);
        console.log('? Admin enrolled and overwritten in wallet');
    } catch (error) {
        console.error(`? Failed to enroll admin: ${error}`);
    }
}

async function registerOrReenrollDevice(wallet) {
    const { deviceID, password } = await inquirer.prompt([
        { type: 'input', name: 'deviceID', message: 'Enter Device ID:' },
        { type: 'input', name: 'password', message: 'Enter Password:' }
    ]);

    const ca = new FabricCAServices(caURL);
    const adminIdentity = await wallet.get('admin');
    if (!adminIdentity) {
        console.error('? Admin identity not found in wallet. Please enroll admin first.');
        return;
    }
    const provider = wallet.getProviderRegistry().getProvider(adminIdentity.type);
    const adminUser = await provider.getUserContext(adminIdentity, 'admin');

    const deviceIdentity = await wallet.get(deviceID);

    if (deviceIdentity) {
        const { overwrite } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'overwrite',
                message: `Device ID "${deviceID}" already exists. Overwrite it?`,
                default: false
            }
        ]);

        if (!overwrite) {
            console.log(`? Skipping enrollment for device ${deviceID}`);
            return;
        }

        try {
            const enrollment = await ca.enroll({ enrollmentID: deviceID, enrollmentSecret: password });

            const identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes()
                },
                mspId: mspOrg1,
                type: 'X.509'
            };

            await wallet.put(deviceID, identity);
            console.log(`? Device ${deviceID} re-enrolled and overwritten in wallet.`);
        } catch (error) {
            console.error(`? Re-enroll failed for ${deviceID}. Trying to register again...`);
            await registerAndEnrollDevice(ca, adminUser, wallet, deviceID, password);
        }

    } else {
        console.log(`? Device ${deviceID} not found in wallet. Registering...`);
        await registerAndEnrollDevice(ca, adminUser, wallet, deviceID, password);
    }
}


async function registerAndEnrollDevice(ca, adminUser, wallet, deviceID, password) {
    try {
        await ca.register({ affiliation: 'org1.department1', enrollmentID: deviceID, enrollmentSecret: password, role: 'client' }, adminUser);
        console.log(`Device ${deviceID} registered successfully.`);

        const enrollment = await ca.enroll({ enrollmentID: deviceID, enrollmentSecret: password });

        const identity = {
            credentials: {
                certificate: enrollment.certificate,
                privateKey: enrollment.key.toBytes()
            },
            mspId: mspOrg1,
            type: 'X.509'
        };

        await wallet.put(deviceID, identity);
        console.log(`Device ${deviceID} enrolled and added to wallet.`);
    } catch (error) {
        console.error(`Failed to register/enroll device ${deviceID}: ${error}`);
    }
}

async function listDevices() {
    const walletDir = path.join(__dirname, './wallet');
    const deviceFiles = await fs.readdir(walletDir);

    const deviceIDs = deviceFiles
        .filter(name => name.endsWith('.id'))
        .map(name => name.replace('.id', ''));

    if (deviceIDs.length === 0) {
        console.log('No devices found in the wallet.');
    } else {
        console.log('Enrolled Devices:');
        deviceIDs.forEach((id, index) => {
            console.log(`${index + 1}. ${id}`);
        });
    }
}

main();
