const express = require('express');
const cors = require('cors');
const didService = require('./did-service');
const { connectToNetwork } = require('./fabric-connection');

const app = express();
const PORT = 3001;

// Middlewares
// CORS to allow React dashboard (Member 3) on port 3000 to connect
app.use(cors({ origin: 'http://localhost:3000' }));
// Parse JSON payloads
app.use(express.json());

// ============================================================================
// PAPER 1: "Blockchain-Based Decentralized Identity System" (Zaghdoudi et al., IEEE DCOSS-IoT 2025)
// ============================================================================

// Section Reference: DID Registration Phase
app.post('/api/register', async (req, res) => {
    try {
        const { deviceId, publicKey, signature, verificationMethod } = req.body;
        
        if (!deviceId || !publicKey || !signature || !verificationMethod) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing required fields: deviceId, publicKey, signature, verificationMethod" 
            });
        }

        const result = await didService.registerDeviceDID(deviceId, publicKey, signature, verificationMethod);
        res.status(200).json(result);
    } catch (error) {
        console.error(`Error in /api/register: ${error.message}`);
        res.status(500).json({ success: false, message: "Internal server error during registration" });
    }
});

// Section Reference: Authentication Phase
app.post('/api/authenticate', async (req, res) => {
    try {
        const { deviceId, challenge, signature } = req.body;
        
        if (!deviceId || !challenge || !signature) {
            return res.status(400).json({ 
                success: false, 
                message: "Missing required fields: deviceId, challenge, signature" 
            });
        }

        const result = await didService.authenticateDevice(deviceId, challenge, signature);
        res.status(200).json(result);
    } catch (error) {
        console.error(`Error in /api/authenticate: ${error.message}`);
        res.status(500).json({ success: false, message: "Internal server error during authentication" });
    }
});

// API to list all registered devices
app.get('/api/devices', async (req, res) => {
    try {
        const devices = await didService.getAllDevices();
        res.status(200).json({ 
            success: true, 
            count: devices.length,
            devices: devices 
        });
    } catch (error) {
        console.error(`Error in /api/devices: ${error.message}`);
        res.status(500).json({ success: false, message: "Internal server error listing devices" });
    }
});

// API to get a single device by ID
app.get('/api/device/:deviceId', async (req, res) => {
    try {
        const { deviceId } = req.params;
        const device = await didService.getDevice(deviceId);
        
        if (!device) {
            return res.status(404).json({ success: false, message: `Device ${deviceId} not found` });
        }
        
        res.status(200).json({ success: true, device });
    } catch (error) {
        console.error(`Error in /api/device/:deviceId: ${error.message}`);
        res.status(500).json({ success: false, message: "Internal server error fetching device" });
    }
});

// Health check endpoint (Returns Paper reference and device count)
app.get('/api/health', async (req, res) => {
    try {
        const devices = await didService.getAllDevices();
        res.status(200).json({ 
            status: "running",
            paper: "Zaghdoudi et al. IEEE DCOSS-IoT 2025",
            registeredDevices: devices.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error in /api/health: ${error.message}`);
        res.status(500).json({ status: "error", message: "Health check failed" });
    }
});

// ============================================================================
// PHASE 2: 4-Tier Access Control Middleware & Route
// ============================================================================
//
// checkDeviceAccess middleware queries the trust-score chaincode's
// checkAccessPermission function before allowing device-initiated actions.
// REVOKED devices are blocked with HTTP 403.
// ============================================================================

/**
 * Cached Fabric connection for the trust-score chaincode.
 * Lazy-initialized on first use and reused across requests.
 */
let trustScoreConnection = null;

/**
 * Returns a trust-score contract, connecting to Fabric if needed.
 * Returns null if Fabric is unavailable (simulation mode).
 */
async function getTrustScoreContract() {
    if (trustScoreConnection) {
        return trustScoreConnection.contract;
    }

    const connection = await connectToNetwork('iot-channel', 'trust-score');
    if (connection) {
        trustScoreConnection = connection;
        return connection.contract;
    }

    return null;
}

/**
 * checkDeviceAccess — Express middleware for Phase 2 tier-based access control.
 *
 * This middleware runs before any device-initiated action (not registration).
 * It queries the trust-score chaincode's checkAccessPermission function for
 * the requesting deviceId.
 *
 * Behavior:
 *   - If the chaincode says allowed=false (REVOKED), returns HTTP 403 with
 *     the reason from the chaincode response.
 *   - If allowed=true, attaches the access decision to req.trustAccess and
 *     calls next().
 *   - If Fabric is unavailable (simulation mode), logs a warning and proceeds
 *     with a simulation header.
 *
 * @param {Request} req - Express request (must have :deviceId param)
 * @param {Response} res - Express response
 * @param {Function} next - Express next middleware
 */
async function checkDeviceAccess(req, res, next) {
    const { deviceId } = req.params;

    if (!deviceId) {
        return res.status(400).json({
            success: false,
            message: 'deviceId parameter is required'
        });
    }

    try {
        const contract = await getTrustScoreContract();

        if (!contract) {
            // Fabric unavailable — simulation mode: allow through with warning
            console.warn(`[TRUST-GATE] Fabric unavailable. Allowing device ${deviceId} in SIMULATION MODE.`);
            res.set('X-Trust-Mode', 'simulation');
            req.trustAccess = {
                deviceId: deviceId,
                allowed: true,
                tier: 'SIMULATION',
                score: null,
                reason: 'Fabric network unavailable. Running in simulation mode.'
            };
            return next();
        }

        // Query the chaincode for access permission
        const resultBytes = await contract.evaluateTransaction('checkAccessPermission', deviceId);
        const accessDecision = JSON.parse(resultBytes.toString());

        if (!accessDecision.allowed) {
            // REVOKED — block with 403
            console.log(`[TRUST-GATE] ACCESS DENIED for device ${deviceId}: tier=${accessDecision.tier}, score=${accessDecision.score}`);
            return res.status(403).json({
                success: false,
                message: 'Access denied — device trust level insufficient',
                deviceId: accessDecision.deviceId,
                tier: accessDecision.tier,
                score: accessDecision.score,
                reason: accessDecision.reason
            });
        }

        // Access granted — attach decision to request and proceed
        console.log(`[TRUST-GATE] ACCESS GRANTED for device ${deviceId}: tier=${accessDecision.tier}, score=${accessDecision.score}`);
        req.trustAccess = accessDecision;
        next();

    } catch (error) {
        console.error(`[TRUST-GATE] Error checking access for ${deviceId}: ${error.message}`);
        return res.status(500).json({
            success: false,
            message: 'Internal error while checking device trust level',
            deviceId: deviceId
        });
    }
}

// ============================================================================
// Phase 2 Route: Device Action (guarded by checkDeviceAccess middleware)
// ============================================================================

/**
 * POST /api/device/:deviceId/action
 *
 * Simulates a device trying to perform an authenticated action after
 * onboarding. The checkDeviceAccess middleware runs first — if the device
 * is REVOKED, this handler is never reached (403 returned by middleware).
 *
 * Proves that the 4-tier enforcement actually blocks REVOKED devices at
 * the API level, not just displaying a red badge on the dashboard.
 */
app.post('/api/device/:deviceId/action', checkDeviceAccess, async (req, res) => {
    try {
        const { deviceId } = req.params;
        const { action } = req.body || {};
        const trustAccess = req.trustAccess;

        res.status(200).json({
            success: true,
            message: 'Device action permitted',
            deviceId: deviceId,
            action: action || 'generic-action',
            tier: trustAccess.tier,
            score: trustAccess.score,
            reason: trustAccess.reason,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error(`Error in /api/device/:deviceId/action: ${error.message}`);
        res.status(500).json({ success: false, message: "Internal server error processing device action" });
    }
});

app.listen(PORT, () => {
    console.log(`=======================================================`);
    console.log(` Gateway Server is RUNNING on port ${PORT}`);
    console.log(` Implementing: Zaghdoudi et al., IEEE DCOSS-IoT 2025`);
    console.log(`=======================================================`);
    console.log(` Available Endpoints:`);
    console.log(`   POST http://localhost:${PORT}/api/register       - Register a device's DID`);
    console.log(`   POST http://localhost:${PORT}/api/authenticate   - Authenticate a device`);
    console.log(`   GET  http://localhost:${PORT}/api/devices        - List all registered devices`);
    console.log(`   GET  http://localhost:${PORT}/api/device/:id     - Get single device info`);
    console.log(`   GET  http://localhost:${PORT}/api/health         - Health check`);
    console.log(` Phase 2 Endpoints:`);
    console.log(`   POST http://localhost:${PORT}/api/device/:id/action - Device action (tier-gated)`);
    console.log(`=======================================================`);
});
