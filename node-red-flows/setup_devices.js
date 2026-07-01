/**
 * Node-RED Device Simulation Setup
 * Registers 100 virtual IoT devices via the Gateway Server
 * Implements Zaghdoudi et al. Section III-A
 */

const axios = require('axios');
const crypto = require('crypto');

const GATEWAY_URL = 'http://localhost:3001/api';
const NUM_DEVICES = 100;

async function simulateDeviceOnboarding(deviceNumber) {
  const deviceId = `device_${String(deviceNumber).padStart(3, '0')}`;

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  });

  const pubB64 = publicKey.toString('base64');
  const signature = 'SIMULATED_VALID_SIGNATURE';

  try {
    const res = await axios.post(`${GATEWAY_URL}/register`, {
      deviceId,
      publicKey: pubB64,
      signature,
      verificationMethod: 'EcdsaSecp256k1VerificationKey2019'
    });
    if (res.data.success) {
      console.log(`[OK] ${deviceId} -> ${res.data.did}`);
      return {
        deviceId, did: res.data.did,
        publicKey: pubB64,
        privateKey: privateKey.toString('base64'),
        registered: true
      };
    }
  } catch {
    console.log(`[OFFLINE] ${deviceId} -- local mode`);
    return {
      deviceId, did: `did:iot:${deviceId}`,
      publicKey: pubB64,
      privateKey: privateKey.toString('base64'),
      registered: false, simulationMode: true
    };
  }
}

async function registerAllDevices() {
  console.log(`Registering ${NUM_DEVICES} virtual devices...\n`);
  const devices = [];
  for (let i = 0; i < NUM_DEVICES; i++) {
    devices.push(await simulateDeviceOnboarding(i));
    if (i % 10 === 9) {
      console.log(`Progress: ${i+1}/${NUM_DEVICES}`);
      await new Promise(r => setTimeout(r, 500));
    }
  }
  const ok = devices.filter(d => d.registered).length;
  console.log(`\n[DONE] ${ok}/${NUM_DEVICES} registered`);
  return devices;
}

registerAllDevices().catch(console.error);
module.exports = { simulateDeviceOnboarding, registerAllDevices };
