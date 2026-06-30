'use strict';

const { Contract, Context } = require('fabric-contract-api');
const crypto = require('crypto');

/**
 * DIDRegistry — Hyperledger Fabric Smart Contract for IoT Device DID Management
 *
 * This chaincode provides Decentralised Identifier (DID) lifecycle management for
 * IoT devices in the IoT Trust System. It supports registration, resolution,
 * authentication (ECDSA P-256), and revocation of device DIDs.
 *
 * DID Format: did:iot:{deviceId}
 *
 * Ledger Key Schema:
 *   - DID record:  "did:iot:{deviceId}" → JSON object with DID document metadata
 *
 * Events Emitted:
 *   - DIDRegistered        — When a new device DID is registered
 *   - DeviceAuthenticated  — When a device is successfully authenticated
 *   - DIDRevoked           — When a device DID is revoked
 *
 * @class DIDRegistry
 * @extends {Contract}
 */
class DIDRegistry extends Contract {

    constructor() {
        super('DIDRegistry');
    }

    /**
     * Registers a new DID for an IoT device on the ledger.
     *
     * Constructs a W3C-compliant DID Document, hashes it with SHA-256,
     * and stores the record on the ledger. Emits a "DIDRegistered" event.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - Unique identifier for the IoT device
     * @param {string} publicKey - The device's public key (PEM or hex encoded)
     * @param {string} serviceEndpoint - The device's service endpoint URL
     * @returns {string} JSON string of the created DID record
     * @throws {Error} If deviceId, publicKey, or serviceEndpoint is empty
     * @throws {Error} If the DID already exists on the ledger
     */
    async registerDID(ctx, deviceId, publicKey, serviceEndpoint) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }
        if (!publicKey || publicKey.trim().length === 0) {
            throw new Error('publicKey is required and cannot be empty');
        }
        if (!serviceEndpoint || serviceEndpoint.trim().length === 0) {
            throw new Error('serviceEndpoint is required and cannot be empty');
        }

        // Log invoking identity
        const clientIdentity = ctx.clientIdentity;
        const invoker = clientIdentity.getID();
        console.log(`[DIDRegistry] registerDID invoked by: ${invoker}`);

        const did = `did:iot:${deviceId}`;

        // Check if DID already exists
        const existingData = await ctx.stub.getState(did);
        if (existingData && existingData.length > 0) {
            throw new Error(`DID '${did}' already exists. Cannot register duplicate.`);
        }

        const now = new Date().toISOString();

        // Build the W3C-style DID Document
        const didDocument = {
            '@context': 'https://www.w3.org/ns/did/v1',
            id: did,
            publicKey: [
                {
                    id: `${did}#keys-1`,
                    type: 'EcdsaSecp256r1VerificationKey2019',
                    controller: did,
                    publicKeyPem: publicKey
                }
            ],
            verificationMethod: [
                {
                    id: `${did}#keys-1`,
                    type: 'EcdsaSecp256r1VerificationKey2019',
                    controller: did,
                    publicKeyPem: publicKey
                }
            ],
            serviceEndpoints: [
                {
                    id: `${did}#service-1`,
                    type: 'IoTDeviceService',
                    serviceEndpoint: serviceEndpoint
                }
            ],
            created: now,
            updated: now,
            status: 'ACTIVE'
        };

        // Hash the DID Document with SHA-256
        const documentHash = crypto
            .createHash('sha256')
            .update(JSON.stringify(didDocument))
            .digest('hex');

        // Build the ledger record
        const ledgerRecord = {
            did: did,
            documentHash: documentHash,
            publicKey: publicKey,
            serviceEndpoint: serviceEndpoint,
            status: 'ACTIVE',
            registeredAt: now,
            updatedAt: now,
            deviceId: deviceId,
            didDocument: didDocument
        };

        // Store on ledger
        await ctx.stub.putState(did, Buffer.from(JSON.stringify(ledgerRecord)));

        // Emit DIDRegistered event
        const eventPayload = {
            did: did,
            deviceId: deviceId,
            timestamp: now
        };
        ctx.stub.setEvent('DIDRegistered', Buffer.from(JSON.stringify(eventPayload)));

        console.log(`[DIDRegistry] DID registered: ${did}`);
        return JSON.stringify(ledgerRecord);
    }

    /**
     * Resolves (retrieves) the full DID document for a given device.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier to resolve
     * @returns {string} JSON string of the DID record
     * @throws {Error} If deviceId is empty
     * @throws {Error} If the DID is not found on the ledger
     */
    async resolveDID(ctx, deviceId) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[DIDRegistry] resolveDID invoked by: ${clientIdentity.getID()}`);

        const did = `did:iot:${deviceId}`;
        const dataBytes = await ctx.stub.getState(did);

        if (!dataBytes || dataBytes.length === 0) {
            throw new Error(`DID not found: '${did}'. The device may not be registered.`);
        }

        const record = JSON.parse(dataBytes.toString());
        console.log(`[DIDRegistry] DID resolved: ${did}, status: ${record.status}`);
        return JSON.stringify(record);
    }

    /**
     * Authenticates a device by verifying an ECDSA P-256 signature over a challenge.
     *
     * Resolves the DID to retrieve the stored public key, then uses Node.js
     * crypto.verify to validate the signature. Emits "DeviceAuthenticated" on success.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier to authenticate
     * @param {string} signature - Base64-encoded ECDSA signature over the challenge
     * @param {string} challenge - The challenge string that was signed
     * @returns {string} JSON string with authentication result
     * @throws {Error} If any parameter is empty
     * @throws {Error} If the DID is not found or has been revoked
     */
    async authenticateDevice(ctx, deviceId, signature, challenge) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }
        if (!signature || signature.trim().length === 0) {
            throw new Error('signature is required and cannot be empty');
        }
        if (!challenge || challenge.trim().length === 0) {
            throw new Error('challenge is required and cannot be empty');
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[DIDRegistry] authenticateDevice invoked by: ${clientIdentity.getID()}`);

        const did = `did:iot:${deviceId}`;

        // Resolve the DID to get the public key
        const dataBytes = await ctx.stub.getState(did);
        if (!dataBytes || dataBytes.length === 0) {
            throw new Error(`DID not found: '${did}'. Cannot authenticate unregistered device.`);
        }

        const record = JSON.parse(dataBytes.toString());

        // Check if the DID has been revoked
        if (record.status === 'REVOKED') {
            throw new Error(`DID '${did}' has been revoked. Authentication denied.`);
        }

        const now = new Date().toISOString();
        let authenticated = false;

        try {
            // Verify the ECDSA P-256 signature
            const verify = crypto.createVerify('SHA256');
            verify.update(challenge);
            verify.end();

            authenticated = verify.verify(
                {
                    key: record.publicKey,
                    dsaEncoding: 'ieee-p1363'
                },
                Buffer.from(signature, 'base64')
            );
        } catch (verifyError) {
            // Signature verification failed (e.g., invalid key format)
            console.log(`[DIDRegistry] Signature verification error for ${did}: ${verifyError.message}`);
            authenticated = false;
        }

        const result = {
            authenticated: authenticated,
            deviceId: deviceId,
            did: did,
            timestamp: now
        };

        // Emit event only on successful authentication
        if (authenticated) {
            const eventPayload = {
                did: did,
                deviceId: deviceId,
                timestamp: now
            };
            ctx.stub.setEvent('DeviceAuthenticated', Buffer.from(JSON.stringify(eventPayload)));
            console.log(`[DIDRegistry] Device authenticated successfully: ${did}`);
        } else {
            console.log(`[DIDRegistry] Device authentication failed: ${did}`);
        }

        return JSON.stringify(result);
    }

    /**
     * Revokes a device DID by setting its status to "REVOKED".
     *
     * The DID record remains on the ledger but is marked as revoked.
     * Emits a "DIDRevoked" event.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier to revoke
     * @returns {string} JSON string of the updated DID record
     * @throws {Error} If deviceId is empty
     * @throws {Error} If the DID is not found on the ledger
     */
    async revokeDID(ctx, deviceId) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[DIDRegistry] revokeDID invoked by: ${clientIdentity.getID()}`);

        const did = `did:iot:${deviceId}`;

        // Resolve the DID
        const dataBytes = await ctx.stub.getState(did);
        if (!dataBytes || dataBytes.length === 0) {
            throw new Error(`DID not found: '${did}'. Cannot revoke a non-existent DID.`);
        }

        const record = JSON.parse(dataBytes.toString());

        // Check if already revoked
        if (record.status === 'REVOKED') {
            console.log(`[DIDRegistry] DID '${did}' is already revoked.`);
            return JSON.stringify(record);
        }

        const now = new Date().toISOString();

        // Update status
        record.status = 'REVOKED';
        record.updatedAt = now;
        if (record.didDocument) {
            record.didDocument.status = 'REVOKED';
            record.didDocument.updated = now;
        }

        // Save back to ledger
        await ctx.stub.putState(did, Buffer.from(JSON.stringify(record)));

        // Emit DIDRevoked event
        const eventPayload = {
            did: did,
            deviceId: deviceId,
            timestamp: now
        };
        ctx.stub.setEvent('DIDRevoked', Buffer.from(JSON.stringify(eventPayload)));

        console.log(`[DIDRegistry] DID revoked: ${did}`);
        return JSON.stringify(record);
    }

    /**
     * Retrieves all registered device DIDs from the ledger.
     *
     * Uses a range query over all keys starting with "did:iot:" to collect
     * every registered device record.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @returns {string} JSON string of an array containing all DID records
     */
    async getAllDevices(ctx) {
        const clientIdentity = ctx.clientIdentity;
        console.log(`[DIDRegistry] getAllDevices invoked by: ${clientIdentity.getID()}`);

        const allResults = [];

        // Range query: "did:iot:" to "did:iot:~" covers all DID keys
        // The tilde (~) character has a high ASCII value ensuring all valid keys are included
        const iterator = await ctx.stub.getStateByRange('did:iot:', 'did:iot:~');

        let result = await iterator.next();
        while (!result.done) {
            const record = result.value;
            if (record && record.value && record.value.toString().length > 0) {
                try {
                    const jsonRecord = JSON.parse(record.value.toString('utf8'));
                    allResults.push(jsonRecord);
                } catch (parseError) {
                    console.log(`[DIDRegistry] Error parsing record: ${parseError.message}`);
                }
            }
            result = await iterator.next();
        }
        await iterator.close();

        console.log(`[DIDRegistry] getAllDevices returned ${allResults.length} device(s).`);
        return JSON.stringify(allResults);
    }
}

module.exports.contracts = [DIDRegistry];
