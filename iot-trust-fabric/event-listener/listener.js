/**
 * =============================================================================
 * listener.js — Fabric Blockchain Event Listener for IoT Trust System
 * =============================================================================
 *
 * This script connects to the Hyperledger Fabric gateway, subscribes to
 * chaincode events from both the DID Registry and Trust Score chaincodes,
 * and forwards all events to connected WebSocket clients in real-time.
 *
 * HOW TO RUN:
 *   1. Ensure the Fabric network is running and chaincodes are deployed.
 *   2. Ensure the admin identity is enrolled in ./wallet/
 *      (Run the enroll-admin script first if wallet is empty.)
 *   3. Start the listener:
 *        node listener.js
 *
 * HOW TO TEST:
 *   Connect with wscat to receive real-time events:
 *     npx wscat -c ws://localhost:8080
 *
 *   Then invoke chaincode transactions from another terminal.
 *   Events will appear in the WebSocket client as JSON messages.
 *
 * ENVIRONMENT VARIABLES (optional, via .env file):
 *   WS_PORT              — WebSocket server port (default: 8080)
 *   CHANNEL_NAME          — Fabric channel name (default: iot-channel)
 *   CONNECTION_PROFILE    — Path to connection profile JSON
 *   WALLET_PATH           — Path to the filesystem wallet
 *   ADMIN_IDENTITY        — Admin identity label in the wallet (default: admin)
 *
 * =============================================================================
 */

'use strict';

require('dotenv').config();

const path = require('path');
const fs = require('fs');
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');
const { WebSocketServer } = require('ws');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const WS_PORT = parseInt(process.env.WS_PORT, 10) || 8080;
const CHANNEL_NAME = process.env.CHANNEL_NAME || 'iot-channel';
const CONNECTION_PROFILE_PATH = process.env.CONNECTION_PROFILE ||
    path.resolve(__dirname, '..', 'fabric-network', 'connection-profile.json');
const WALLET_PATH = process.env.WALLET_PATH || path.resolve(__dirname, 'wallet');
const ADMIN_IDENTITY = process.env.ADMIN_IDENTITY || 'admin';
const RECONNECT_DELAY_MS = 5000;

// Chaincode names
const DID_CHAINCODE = 'did-registry';
const TRUST_CHAINCODE = 'trust-score';

// Events to subscribe to
const DID_EVENTS = ['DIDRegistered', 'DIDRevoked', 'DeviceAuthenticated'];
const TRUST_EVENTS = ['TrustScoreUpdated', 'DeviceBlacklisted'];

// ---------------------------------------------------------------------------
// Globals
// ---------------------------------------------------------------------------
let gateway = null;
let wss = null;
let isShuttingDown = false;

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------
function timestamp() {
    return new Date().toISOString();
}

function log(level, message) {
    console.log(`[${timestamp()}] [${level}] ${message}`);
}

// ---------------------------------------------------------------------------
// WebSocket Server
// ---------------------------------------------------------------------------

/**
 * Initializes the WebSocket server and sets up connection handlers.
 * @returns {WebSocketServer} The created WebSocket server instance.
 */
function startWebSocketServer() {
    const server = new WebSocketServer({ port: WS_PORT });

    server.on('listening', () => {
        log('INFO', `WebSocket server listening on ws://localhost:${WS_PORT}`);
    });

    server.on('connection', (ws, req) => {
        const clientIP = req.socket.remoteAddress;
        log('INFO', `WebSocket client connected from ${clientIP}`);

        // Send a welcome message
        ws.send(JSON.stringify({
            type: 'CONNECTION_ESTABLISHED',
            payload: {
                message: 'Connected to IoT Trust Event Listener',
                subscribedEvents: [...DID_EVENTS, ...TRUST_EVENTS],
                channel: CHANNEL_NAME
            },
            timestamp: timestamp()
        }));

        ws.on('close', () => {
            log('INFO', `WebSocket client disconnected: ${clientIP}`);
        });

        ws.on('error', (err) => {
            log('ERROR', `WebSocket client error (${clientIP}): ${err.message}`);
        });
    });

    server.on('error', (err) => {
        log('ERROR', `WebSocket server error: ${err.message}`);
    });

    return server;
}

/**
 * Broadcasts a JSON message to all connected WebSocket clients.
 * @param {object} message - The message object to broadcast.
 */
function broadcastToClients(message) {
    if (!wss) return;

    const data = JSON.stringify(message);
    let sentCount = 0;

    wss.clients.forEach((client) => {
        if (client.readyState === 1) { // WebSocket.OPEN
            client.send(data);
            sentCount++;
        }
    });

    if (sentCount > 0) {
        log('INFO', `Event broadcasted to ${sentCount} client(s): ${message.type}`);
    }
}

// ---------------------------------------------------------------------------
// Wallet & Identity Management
// ---------------------------------------------------------------------------

/**
 * Ensures an admin identity exists in the filesystem wallet.
 * If the wallet is empty, enrolls the admin using the Fabric CA.
 *
 * @param {object} ccp - The connection profile object.
 * @returns {Wallet} The filesystem wallet with admin identity.
 */
async function getOrCreateWallet(ccp) {
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

    // Check if admin identity already exists
    const identity = await wallet.get(ADMIN_IDENTITY);
    if (identity) {
        log('INFO', `Admin identity '${ADMIN_IDENTITY}' found in wallet.`);
        return wallet;
    }

    log('INFO', `Admin identity not found. Importing from cryptogen materials...`);

    const certPath = path.resolve(__dirname, '..', 'fabric-network', 'crypto-config', 'peerOrganizations', 'iot.example.com', 'users', 'Admin@iot.example.com', 'msp', 'signcerts', 'Admin@iot.example.com-cert.pem');
    const keyPath = path.resolve(__dirname, '..', 'fabric-network', 'crypto-config', 'peerOrganizations', 'iot.example.com', 'users', 'Admin@iot.example.com', 'msp', 'keystore', 'priv_sk');

    const cert = fs.readFileSync(certPath, 'utf8');
    const key = fs.readFileSync(keyPath, 'utf8');

    const x509Identity = {
        credentials: {
            certificate: cert,
            privateKey: key
        },
        mspId: 'IoTOrgMSP',
        type: 'X.509'
    };

    await wallet.put(ADMIN_IDENTITY, x509Identity);
    log('INFO', `Admin identity imported and stored in wallet at ${WALLET_PATH}`);

    return wallet;
}

// ---------------------------------------------------------------------------
// Event Handler Factory
// ---------------------------------------------------------------------------

/**
 * Creates a chaincode event handler that logs and broadcasts events.
 *
 * @param {string} chaincodeId - The chaincode name for context.
 * @returns {Function} Event handler function.
 */
function createEventHandler(chaincodeId) {
    return (event) => {
        const eventName = event.eventName;
        let payload = {};

        if (event.payload) {
            try {
                payload = JSON.parse(event.payload.toString('utf8'));
            } catch (parseError) {
                payload = { raw: event.payload.toString('utf8') };
            }
        }

        log('EVENT', `[${chaincodeId}] ${eventName}: ${JSON.stringify(payload)}`);

        // Broadcast to all WebSocket clients
        broadcastToClients({
            type: eventName,
            chaincode: chaincodeId,
            payload: payload,
            timestamp: timestamp()
        });
    };
}

// ---------------------------------------------------------------------------
// Gateway Connection & Event Subscription
// ---------------------------------------------------------------------------

/**
 * Connects to the Fabric gateway, subscribes to chaincode events, and
 * maintains the connection with automatic reconnection on failure.
 */
async function connectAndListen() {
    if (isShuttingDown) return;

    try {
        // Load connection profile
        if (!fs.existsSync(CONNECTION_PROFILE_PATH)) {
            throw new Error(`Connection profile not found at: ${CONNECTION_PROFILE_PATH}`);
        }

        let ccpJSON = fs.readFileSync(CONNECTION_PROFILE_PATH, 'utf8');
        const cryptoConfigPath = path.resolve(__dirname, '..', 'fabric-network', 'crypto-config');
        ccpJSON = ccpJSON.replace(/path\/to\/crypto-config/g, cryptoConfigPath);
        const ccp = JSON.parse(ccpJSON);

        log('INFO', 'Connection profile loaded successfully.');

        // Get or create wallet with admin identity
        const wallet = await getOrCreateWallet(ccp);

        // Connect to gateway
        gateway = new Gateway();
        await gateway.connect(ccp, {
            wallet: wallet,
            identity: ADMIN_IDENTITY,
            discovery: { enabled: false, asLocalhost: true },
            eventHandlerOptions: {
                commitTimeout: 300,
                endorseTimeout: 300
            }
        });

        log('INFO', 'Connected to Fabric gateway.');

        // Get the network (channel)
        const network = await gateway.getNetwork(CHANNEL_NAME);
        log('INFO', `Connected to channel: ${CHANNEL_NAME}`);

        // --- Subscribe to DID Registry events ---
        const didContract = network.getContract(DID_CHAINCODE);
        const didEventHandler = createEventHandler(DID_CHAINCODE);

        const didListener = async (event) => {
            if (DID_EVENTS.includes(event.eventName)) {
                didEventHandler(event);
            }
        };
        await didContract.addContractListener(didListener);
        log('INFO', `Subscribed to DID Registry events: ${DID_EVENTS.join(', ')}`);

        // --- Subscribe to Trust Score events ---
        const trustContract = network.getContract(TRUST_CHAINCODE);
        const trustEventHandler = createEventHandler(TRUST_CHAINCODE);

        const trustListener = async (event) => {
            if (TRUST_EVENTS.includes(event.eventName)) {
                trustEventHandler(event);
            }
        };
        await trustContract.addContractListener(trustListener);
        log('INFO', `Subscribed to Trust Score events: ${TRUST_EVENTS.join(', ')}`);

        log('INFO', '=== Event listener is active. Waiting for blockchain events... ===');

    } catch (err) {
        log('ERROR', `Gateway connection failed: ${err.message}`);

        // Clean up the failed connection
        if (gateway) {
            try {
                gateway.disconnect();
            } catch (disconnectErr) {
                // Ignore disconnect errors during cleanup
            }
            gateway = null;
        }

        // Schedule reconnection attempt
        if (!isShuttingDown) {
            log('INFO', `Reconnecting in ${RECONNECT_DELAY_MS / 1000} seconds...`);
            setTimeout(connectAndListen, RECONNECT_DELAY_MS);
        }
    }
}

// ---------------------------------------------------------------------------
// Graceful Shutdown
// ---------------------------------------------------------------------------

/**
 * Handles graceful shutdown on SIGINT/SIGTERM.
 * Disconnects from the Fabric gateway and closes the WebSocket server.
 */
async function shutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    log('INFO', `Received ${signal}. Shutting down gracefully...`);

    // Disconnect from Fabric gateway
    if (gateway) {
        try {
            gateway.disconnect();
            log('INFO', 'Disconnected from Fabric gateway.');
        } catch (err) {
            log('ERROR', `Error disconnecting gateway: ${err.message}`);
        }
    }

    // Close WebSocket server
    if (wss) {
        // Close all client connections
        wss.clients.forEach((client) => {
            client.close(1001, 'Server shutting down');
        });

        wss.close(() => {
            log('INFO', 'WebSocket server closed.');
        });
    }

    log('INFO', 'Shutdown complete. Goodbye!');
    process.exit(0);
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

async function main() {
    log('INFO', '============================================');
    log('INFO', ' IoT Trust System — Event Listener');
    log('INFO', '============================================');
    log('INFO', `Channel:    ${CHANNEL_NAME}`);
    log('INFO', `WS Port:    ${WS_PORT}`);
    log('INFO', `Wallet:     ${WALLET_PATH}`);
    log('INFO', `Profile:    ${CONNECTION_PROFILE_PATH}`);
    log('INFO', '');

    // Start WebSocket server
    wss = startWebSocketServer();

    // Register shutdown handlers
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Connect to Fabric and start listening for events
    await connectAndListen();
}

// Run
main().catch((err) => {
    log('FATAL', `Unhandled error: ${err.message}`);
    console.error(err);
    process.exit(1);
});
