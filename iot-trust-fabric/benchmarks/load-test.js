/**
 * =============================================================================
 * load-test.js — Performance Benchmarks for IoT Trust Fabric Network
 * =============================================================================
 *
 * This script benchmarks the Hyperledger Fabric blockchain under various
 * load patterns. It measures transactions per second (TPS), latency
 * distributions, and block commit times.
 *
 * Tests:
 *   1. Concurrent DID Registration — 100 devices via Promise.all
 *   2. Sequential Trust Score Updates — 100 devices one-by-one
 *   3. Mixed Load — 50 reads + 50 writes interleaved
 *
 * Usage:
 *   node load-test.js
 *
 * Prerequisites:
 *   - Fabric network running with both chaincodes deployed
 *   - Admin identity enrolled in ../event-listener/wallet/
 *     (or run the event listener first to auto-enroll)
 *
 * Results are printed to console and saved to benchmarks/results.json
 * =============================================================================
 */

'use strict';

const path = require('path');
const fs = require('fs');
const { Gateway, Wallets } = require('fabric-network');
const FabricCAServices = require('fabric-ca-client');

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
const CHANNEL_NAME = 'iot-channel';
const DID_CHAINCODE = 'did-registry';
const TRUST_CHAINCODE = 'trust-score';
const CONNECTION_PROFILE_PATH = path.resolve(__dirname, '..', 'fabric-network', 'connection-profile.json');
const WALLET_PATH = path.resolve(__dirname, 'wallet');
const ADMIN_IDENTITY = 'admin';
const DEVICE_COUNT = 100;
const RESULTS_PATH = path.resolve(__dirname, 'results.json');

// Paper benchmark targets for comparison
const PAPER_TARGET_LATENCY_MS = 13.64;
const PAPER_TARGET_OVERHEAD_MB = 1.75;

// ---------------------------------------------------------------------------
// Utility Functions
// ---------------------------------------------------------------------------

/**
 * Returns current high-resolution time in milliseconds.
 * @returns {number} Time in ms.
 */
function now() {
    const [sec, nsec] = process.hrtime();
    return sec * 1000 + nsec / 1e6;
}

/**
 * Generates a zero-padded device ID.
 * @param {string} prefix - Prefix for the device ID.
 * @param {number} index - Device index.
 * @returns {string} Formatted device ID (e.g., "bench-device-001").
 */
function deviceId(prefix, index) {
    return `${prefix}${String(index).padStart(3, '0')}`;
}

/**
 * Computes latency statistics from an array of latency values (in ms).
 * @param {number[]} latencies - Array of latency measurements.
 * @returns {{ min: number, max: number, avg: number }} Statistics in ms.
 */
function computeStats(latencies) {
    if (latencies.length === 0) {
        return { min: 0, max: 0, avg: 0 };
    }
    const min = Math.min(...latencies);
    const max = Math.max(...latencies);
    const avg = latencies.reduce((sum, l) => sum + l, 0) / latencies.length;
    return { min, max, avg };
}

// ---------------------------------------------------------------------------
// Wallet & Identity
// ---------------------------------------------------------------------------

/**
 * Ensures an admin identity exists in the wallet.
 * @param {object} ccp - Connection profile.
 * @returns {Wallet} The filesystem wallet.
 */
async function getOrCreateWallet(ccp) {
    const wallet = await Wallets.newFileSystemWallet(WALLET_PATH);

    const identity = await wallet.get(ADMIN_IDENTITY);
    if (identity) {
        console.log(`[SETUP] Admin identity found in wallet.`);
        return wallet;
    }

    console.log(`[SETUP] Admin identity not found. Importing from cryptogen materials...`);

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
    console.log(`[SETUP] Admin identity imported and stored in wallet.`);
    return wallet;
}

// ---------------------------------------------------------------------------
// Benchmark Tests
// ---------------------------------------------------------------------------

/**
 * Test 1 — Concurrent DID Registration
 *
 * Registers 100 unique devices concurrently using Promise.all.
 * Measures total time, TPS, and per-transaction latency statistics.
 *
 * @param {Contract} didContract - The DID Registry contract.
 * @returns {object} Test results.
 */
async function test1ConcurrentDIDRegistration(didContract) {
    console.log('\n[TEST 1] Concurrent DID Registration — 100 devices');
    console.log('─'.repeat(50));

    const latencies = [];
    const errors = [];

    const startTotal = now();

    const promises = [];
    for (let i = 1; i <= DEVICE_COUNT; i++) {
        const id = deviceId('bench-did-', i);
        const publicKey = `benchPublicKey_${id}`;
        const endpoint = `http://localhost:3000/devices/${id}`;

        const promise = (async () => {
            const start = now();
            try {
                await didContract.submitTransaction('registerDID', id, publicKey, endpoint);
                const latency = now() - start;
                latencies.push(latency);
            } catch (err) {
                const latency = now() - start;
                latencies.push(latency);
                errors.push({ deviceId: id, error: err.message });
            }
        })();

        promises.push(promise);
    }

    await Promise.all(promises);
    const totalTime = (now() - startTotal) / 1000; // seconds

    const stats = computeStats(latencies);
    const tps = DEVICE_COUNT / totalTime;

    console.log(`  Devices:     ${DEVICE_COUNT}`);
    console.log(`  Successful:  ${DEVICE_COUNT - errors.length}`);
    console.log(`  Errors:      ${errors.length}`);
    console.log(`  Total Time:  ${totalTime.toFixed(2)} seconds`);
    console.log(`  TPS:         ${tps.toFixed(2)}`);
    console.log(`  Avg Latency: ${stats.avg.toFixed(2)} ms`);
    console.log(`  Min Latency: ${stats.min.toFixed(2)} ms`);
    console.log(`  Max Latency: ${stats.max.toFixed(2)} ms`);

    return {
        name: 'Concurrent DID Registration',
        devices: DEVICE_COUNT,
        successful: DEVICE_COUNT - errors.length,
        errors: errors.length,
        totalTimeSeconds: parseFloat(totalTime.toFixed(2)),
        tps: parseFloat(tps.toFixed(2)),
        avgLatencyMs: parseFloat(stats.avg.toFixed(2)),
        minLatencyMs: parseFloat(stats.min.toFixed(2)),
        maxLatencyMs: parseFloat(stats.max.toFixed(2))
    };
}

/**
 * Test 2 — Sequential Trust Score Updates
 *
 * Updates trust scores for 100 devices sequentially.
 * Measures block commit time and chaincode execution time per call.
 *
 * @param {Contract} trustContract - The Trust Score contract.
 * @param {Network} network - The Fabric network (channel).
 * @returns {object} Test results.
 */
async function test2SequentialTrustUpdates(trustContract, network) {
    console.log('\n[TEST 2] Sequential Trust Score Updates — 100 devices');
    console.log('─'.repeat(50));

    const chaincodeExecTimes = [];
    const blockCommitTimes = [];
    const errors = [];

    for (let i = 1; i <= DEVICE_COUNT; i++) {
        const id = deviceId('bench-did-', i);
        const score = (Math.random() * 0.8 + 0.1).toFixed(4); // 0.1 to 0.9
        const success = Math.floor(Math.random() * 100).toString();
        const failure = Math.floor(Math.random() * 20).toString();
        const malicious = Math.random() < 0.05 ? 'true' : 'false';

        const startExec = now();
        try {
            // Measure chaincode execution (submit time includes ordering + commit)
            const startCommit = now();
            await trustContract.submitTransaction(
                'updateTrustScore', id, score, success, failure, malicious
            );
            const commitTime = now() - startCommit;
            const execTime = now() - startExec;

            chaincodeExecTimes.push(execTime);
            blockCommitTimes.push(commitTime);
        } catch (err) {
            errors.push({ deviceId: id, error: err.message });
        }

        // Progress indicator
        if (i % 25 === 0) {
            console.log(`  Progress: ${i}/${DEVICE_COUNT}`);
        }
    }

    const execStats = computeStats(chaincodeExecTimes);
    const commitStats = computeStats(blockCommitTimes);

    console.log(`  Total Updates:     ${DEVICE_COUNT}`);
    console.log(`  Successful:        ${DEVICE_COUNT - errors.length}`);
    console.log(`  Errors:            ${errors.length}`);
    console.log(`  Block Commit Time: ${commitStats.avg.toFixed(2)} ms (avg)`);
    console.log(`  Chaincode Exec:    ${execStats.avg.toFixed(2)} ms (avg)`);

    return {
        name: 'Sequential Trust Score Updates',
        totalUpdates: DEVICE_COUNT,
        successful: DEVICE_COUNT - errors.length,
        errors: errors.length,
        avgBlockCommitMs: parseFloat(commitStats.avg.toFixed(2)),
        minBlockCommitMs: parseFloat(commitStats.min.toFixed(2)),
        maxBlockCommitMs: parseFloat(commitStats.max.toFixed(2)),
        avgChaincodeExecMs: parseFloat(execStats.avg.toFixed(2)),
        minChaincodeExecMs: parseFloat(execStats.min.toFixed(2)),
        maxChaincodeExecMs: parseFloat(execStats.max.toFixed(2))
    };
}

/**
 * Test 3 — Mixed Load
 *
 * Interleaves 50 concurrent read operations (resolveDID) with 50 concurrent
 * write operations (updateTrustScore) to simulate realistic mixed workload.
 *
 * @param {Contract} didContract - The DID Registry contract.
 * @param {Contract} trustContract - The Trust Score contract.
 * @returns {object} Test results.
 */
async function test3MixedLoad(didContract, trustContract) {
    console.log('\n[TEST 3] Mixed Load — 50 reads + 50 writes concurrent');
    console.log('─'.repeat(50));

    const totalOps = 100;
    const readCount = 50;
    const writeCount = 50;
    const latencies = [];
    const errors = [];

    const startTotal = now();
    const promises = [];

    // 50 concurrent read operations (resolveDID)
    for (let i = 1; i <= readCount; i++) {
        const id = deviceId('bench-did-', i);
        const promise = (async () => {
            const start = now();
            try {
                await didContract.evaluateTransaction('resolveDID', id);
                latencies.push(now() - start);
            } catch (err) {
                latencies.push(now() - start);
                errors.push({ op: 'read', deviceId: id, error: err.message });
            }
        })();
        promises.push(promise);
    }

    // 50 concurrent write operations (updateTrustScore)
    for (let i = 1; i <= writeCount; i++) {
        const id = deviceId('bench-did-', i);
        const score = (Math.random() * 0.8 + 0.1).toFixed(4);
        const promise = (async () => {
            const start = now();
            try {
                await trustContract.submitTransaction(
                    'updateTrustScore', id, score,
                    Math.floor(Math.random() * 100).toString(),
                    Math.floor(Math.random() * 20).toString(),
                    'false'
                );
                latencies.push(now() - start);
            } catch (err) {
                latencies.push(now() - start);
                errors.push({ op: 'write', deviceId: id, error: err.message });
            }
        })();
        promises.push(promise);
    }

    await Promise.all(promises);
    const totalTime = (now() - startTotal) / 1000; // seconds

    const stats = computeStats(latencies);
    const tps = totalOps / totalTime;

    console.log(`  Total Operations: ${totalOps}`);
    console.log(`  Reads:            ${readCount}`);
    console.log(`  Writes:           ${writeCount}`);
    console.log(`  Successful:       ${totalOps - errors.length}`);
    console.log(`  Errors:           ${errors.length}`);
    console.log(`  Total Time:       ${totalTime.toFixed(2)} seconds`);
    console.log(`  TPS:              ${tps.toFixed(2)}`);
    console.log(`  Avg Latency:      ${stats.avg.toFixed(2)} ms`);

    return {
        name: 'Mixed Load',
        totalOperations: totalOps,
        reads: readCount,
        writes: writeCount,
        successful: totalOps - errors.length,
        errors: errors.length,
        totalTimeSeconds: parseFloat(totalTime.toFixed(2)),
        tps: parseFloat(tps.toFixed(2)),
        avgLatencyMs: parseFloat(stats.avg.toFixed(2)),
        minLatencyMs: parseFloat(stats.min.toFixed(2)),
        maxLatencyMs: parseFloat(stats.max.toFixed(2))
    };
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

async function main() {
    console.log('============================================');
    console.log(' IoT Trust System — Performance Benchmarks');
    console.log('============================================');
    console.log(`Channel:     ${CHANNEL_NAME}`);
    console.log(`Devices:     ${DEVICE_COUNT}`);
    console.log(`Profile:     ${CONNECTION_PROFILE_PATH}`);
    console.log('');

    // Load connection profile
    if (!fs.existsSync(CONNECTION_PROFILE_PATH)) {
        console.error(`[ERROR] Connection profile not found: ${CONNECTION_PROFILE_PATH}`);
        process.exit(1);
    }

    let ccpJSON = fs.readFileSync(CONNECTION_PROFILE_PATH, 'utf8');
    const cryptoConfigPath = path.resolve(__dirname, '..', 'fabric-network', 'crypto-config');
    ccpJSON = ccpJSON.replace(/path\/to\/crypto-config/g, cryptoConfigPath);
    const ccp = JSON.parse(ccpJSON);
    const wallet = await getOrCreateWallet(ccp);

    // Connect to gateway
    const gateway = new Gateway();
    await gateway.connect(ccp, {
        wallet: wallet,
        identity: ADMIN_IDENTITY,
        discovery: { enabled: false, asLocalhost: true }
    });

    console.log('[SETUP] Connected to Fabric gateway.');

    const network = await gateway.getNetwork(CHANNEL_NAME);
    const didContract = network.getContract(DID_CHAINCODE);
    const trustContract = network.getContract(TRUST_CHAINCODE);

    console.log('[SETUP] Contracts obtained. Starting benchmarks...');

    // --- Run Tests ---
    const results = {};

    try {
        results.test1 = await test1ConcurrentDIDRegistration(didContract);
    } catch (err) {
        console.error(`[ERROR] Test 1 failed: ${err.message}`);
        results.test1 = { name: 'Concurrent DID Registration', error: err.message };
    }

    try {
        results.test2 = await test2SequentialTrustUpdates(trustContract, network);
    } catch (err) {
        console.error(`[ERROR] Test 2 failed: ${err.message}`);
        results.test2 = { name: 'Sequential Trust Score Updates', error: err.message };
    }

    try {
        results.test3 = await test3MixedLoad(didContract, trustContract);
    } catch (err) {
        console.error(`[ERROR] Test 3 failed: ${err.message}`);
        results.test3 = { name: 'Mixed Load', error: err.message };
    }

    // --- Print Results Table ---
    console.log('\n');
    console.log('============================================');
    console.log('BENCHMARK RESULTS');
    console.log('============================================');

    if (results.test1 && !results.test1.error) {
        console.log('Test 1: Concurrent DID Registration');
        console.log(`  Devices:          ${results.test1.devices}`);
        console.log(`  Total Time:       ${results.test1.totalTimeSeconds} seconds`);
        console.log(`  TPS:              ${results.test1.tps}`);
        console.log(`  Avg Latency:      ${results.test1.avgLatencyMs} ms`);
        console.log(`  Min Latency:      ${results.test1.minLatencyMs} ms`);
        console.log(`  Max Latency:      ${results.test1.maxLatencyMs} ms`);
    } else {
        console.log('Test 1: Concurrent DID Registration — FAILED');
    }

    console.log('--------------------------------------------');

    if (results.test2 && !results.test2.error) {
        console.log('Test 2: Trust Score Updates');
        console.log(`  Total Updates:    ${results.test2.totalUpdates}`);
        console.log(`  Block Commit Time: ${results.test2.avgBlockCommitMs} ms (avg)`);
        console.log(`  Chaincode Exec:   ${results.test2.avgChaincodeExecMs} ms (avg)`);
    } else {
        console.log('Test 2: Trust Score Updates — FAILED');
    }

    console.log('--------------------------------------------');

    if (results.test3 && !results.test3.error) {
        console.log('Test 3: Mixed Load');
        console.log(`  Total Operations: ${results.test3.totalOperations}`);
        console.log(`  TPS:              ${results.test3.tps}`);
    } else {
        console.log('Test 3: Mixed Load — FAILED');
    }

    console.log('============================================');
    console.log('Compare against paper benchmarks:');
    console.log(`  Target Latency:   ${PAPER_TARGET_LATENCY_MS} ms`);
    console.log(`  Target Overhead:  ${PAPER_TARGET_OVERHEAD_MB} MB`);
    console.log('============================================');

    // --- Save results as JSON ---
    const fullResults = {
        timestamp: new Date().toISOString(),
        configuration: {
            channel: CHANNEL_NAME,
            deviceCount: DEVICE_COUNT,
            fabricVersion: '2.5.0'
        },
        benchmarks: results,
        paperTargets: {
            targetLatencyMs: PAPER_TARGET_LATENCY_MS,
            targetOverheadMB: PAPER_TARGET_OVERHEAD_MB
        }
    };

    fs.writeFileSync(RESULTS_PATH, JSON.stringify(fullResults, null, 2));
    console.log(`\n[INFO] Results saved to: ${RESULTS_PATH}`);

    // Disconnect
    gateway.disconnect();
    console.log('[INFO] Gateway disconnected. Benchmark complete.');
}

// Run
main().catch((err) => {
    console.error(`[FATAL] Unhandled error: ${err.message}`);
    console.error(err);
    process.exit(1);
});
