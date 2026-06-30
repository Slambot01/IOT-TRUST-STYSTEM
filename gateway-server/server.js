const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// Middlewares
// CORS to allow React dashboard (Member 3) on port 3000 to connect
app.use(cors({ origin: 'http://localhost:3000' }));
// Parse JSON payloads
app.use(express.json());

// Placeholder for devices (used for health check for now)
let registeredDevicesCount = 0;

// ============================================================================
// PAPER 1: "Blockchain-Based Decentralized Identity System" (Zaghdoudi et al., IEEE DCOSS-IoT 2025)
// ============================================================================

// Section Reference: DID Registration Phase
app.post('/api/register', (req, res) => {
    // TODO: Implement real DID registration logic connecting to Hyperledger Fabric
    res.json({ success: true, message: "DID registration not implemented yet" });
});

// Section Reference: Authentication Phase
app.post('/api/authenticate', (req, res) => {
    // TODO: Implement real ECDSA authentication logic connecting to Hyperledger Fabric
    res.json({ success: true, message: "Authentication not implemented yet" });
});

// API to list all registered devices
app.get('/api/devices', (req, res) => {
    // TODO: Fetch all devices from DID Registry on Fabric
    res.json({ success: true, message: "Listing devices not implemented yet", devices: [] });
});

// API to get a single device by ID
app.get('/api/device/:deviceId', (req, res) => {
    const { deviceId } = req.params;
    // TODO: Fetch single device from DID Registry on Fabric
    res.json({ success: true, message: `Get device ${deviceId} not implemented yet`, device: null });
});

// Health check endpoint (Returns Paper reference and device count)
app.get('/api/health', (req, res) => {
    res.json({ 
        status: "UP",
        paper_reference: "Zaghdoudi et al., IEEE DCOSS-IoT 2025, DOI: 10.1109/DCOSS-IoT65416.2025.00044",
        device_count: registeredDevicesCount
    });
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
