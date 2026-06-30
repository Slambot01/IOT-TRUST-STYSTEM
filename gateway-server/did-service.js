/**
 * DID Service
 * Implements the core DID Registration and Authentication flow from 
 * Zaghdoudi et al. IEEE DCOSS-IoT 2025, Section III.
 */

const { generateDID, createDIDDocument, hashDocument, verifySignature } = require('./crypto-utils');
const { connectToNetwork } = require('./fabric-connection');

// Simulated Decentralized Storage (Placeholder for IPFS)
const didDocumentStore = new Map();

// Local registry for simulation mode when Fabric is unavailable
const localDeviceRegistry = new Map();

/**
 * 1. Register Device DID
 * Implements paper Section III-A Steps 1-7
 * 
 * @param {string} deviceId 
 * @param {string} publicKey Base64 public key
 * @param {string} signature Base64 signature
 * @param {string} verificationMethod 
 * @returns {Object} Registration result
 */
async function registerDeviceDID(deviceId, publicKey, signature, verificationMethod) {
    // Step 2: Generate DID based on chosen verification method and public key
    const did = generateDID(deviceId);

    // Step 3: Construct a DID document for the IoT device
    const didDocument = createDIDDocument(deviceId, publicKey, []);

    // Step 4: Hash the document (obtaining its unique identifier)
    // This simulates storing in decentralized storage by caching the full document in a Map
    const documentHash = hashDocument(didDocument);
    didDocumentStore.set(documentHash, didDocument);

    // Steps 5-6: Try to call Fabric chaincode function 'registerDID'
    const fabricConnection = await connectToNetwork('mychannel', 'did-registry');
    
    let transactionId = null;

    if (fabricConnection) {
        try {
            const { contract, gateway } = fabricConnection;
            
            // Submitting transaction to the blockchain
            const result = await contract.submitTransaction(
                'registerDID', 
                deviceId, 
                publicKey, 
                documentHash, 
                verificationMethod, 
                signature
            );
            
            transactionId = result.toString();
            gateway.disconnect();
        } catch (error) {
            console.error(`Fabric transaction failed: ${error.message}`);
            return { success: false, message: 'Blockchain registration failed' };
        }
    } else {
        // Fallback to SIMULATION MODE
        localDeviceRegistry.set(deviceId, {
            deviceId,
            did,
            publicKey,
            documentHash,
            verificationMethod,
            signature,
            registeredAt: new Date().toISOString()
        });
        console.log(`[SIMULATION MODE] Stored locally: Device ${deviceId} registered.`);
        transactionId = 'sim-tx-' + Date.now();
    }

    // Step 7: Return response to Gateway/Device
    return {
        success: true,
        did,
        documentHash,
        transactionId,
        message: 'Device DID registered successfully'
    };
}

/**
 * 2. Authenticate Device
 * Implements paper Section III-B Steps 1-11
 * 
 * @param {string} deviceId 
 * @param {string} challenge The random challenge string sent to the device
 * @param {string} signature The signature over the challenge
 * @returns {Object} Authentication result
 */
async function authenticateDevice(deviceId, challenge, signature) {
    // Steps 1-11 involves resolving the DID and verifying the signature
    const fabricConnection = await connectToNetwork('mychannel', 'did-registry');
    
    if (fabricConnection) {
        try {
            const { contract, gateway } = fabricConnection;
            
            // Assuming authenticateDevice chaincode function handles resolution and verification
            const authResultBytes = await contract.evaluateTransaction('authenticateDevice', deviceId, challenge, signature);
            const authResult = JSON.parse(authResultBytes.toString());
            
            gateway.disconnect();
            
            return {
                authenticated: authResult.authenticated,
                deviceId,
                did: generateDID(deviceId),
                reason: authResult.reason || (authResult.authenticated ? 'Blockchain verification successful' : 'Blockchain verification failed')
            };
            
        } catch (error) {
            return {
                authenticated: false,
                deviceId,
                did: generateDID(deviceId),
                reason: `Fabric authentication error: ${error.message}`
            };
        }
    } else {
        // Fallback to SIMULATION MODE
        console.log(`[SIMULATION MODE] Authenticating device ${deviceId} locally...`);
        const deviceData = localDeviceRegistry.get(deviceId);
        
        if (!deviceData) {
            return { 
                authenticated: false, 
                deviceId, 
                did: generateDID(deviceId), 
                reason: 'Device not registered in local registry' 
            };
        }

        // Verify the signature against the challenge using the stored public key
        const isValid = verifySignature(deviceData.publicKey, challenge, signature);

        if (isValid) {
            return { authenticated: true, deviceId, did: deviceData.did, reason: 'Simulated verification successful' };
        } else {
            return { authenticated: false, deviceId, did: deviceData.did, reason: 'Simulated verification failed - Invalid signature' };
        }
    }
}

/**
 * 3. Get DID Document
 * Simple lookup in the in-memory Map (simulated decentralized storage)
 * @param {string} documentHash 
 * @returns {Object|null}
 */
function getDIDDocument(documentHash) {
    return didDocumentStore.get(documentHash) || null;
}

module.exports = {
    registerDeviceDID,
    authenticateDevice,
    getDIDDocument
};
