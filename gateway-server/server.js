const express = require('express');
const cors = require('cors');
const didService = require('./did-service');

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
    console.log(`=======================================================`);
});
