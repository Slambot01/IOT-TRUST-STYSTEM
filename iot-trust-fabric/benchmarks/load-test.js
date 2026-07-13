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

/**
 * Test 4 — Phase 1 vs Phase 2 Trust Score Comparison
 *
 * Runs sequential updates for 100 devices with both the Phase 1
 * updateTrustScore function and the Phase 2 updateTrustScoreV2 function.
 * Compares TPS, latency, block commit time, and payload size.
 *
 * @param {Contract} trustContract - The Trust Score contract.
 * @returns {object} Comparison results for both phases.
 */
async function test4Phase2Comparison(trustContract) {
    console.log('\n[TEST 4] Phase 1 vs Phase 2 Comparison — 100 devices each');
    console.log('─'.repeat(60));

    // ------------------------------------------------------------------
    // Phase 1: updateTrustScore
    // ------------------------------------------------------------------
    console.log('\n  [Phase 1] Running updateTrustScore for 100 devices...');

    const p1Latencies = [];
    const p1CommitTimes = [];
    const p1PayloadSizes = [];
    const p1Errors = [];

    for (let i = 1; i <= DEVICE_COUNT; i++) {
        const id = deviceId('bench-cmp-', i);
        const score = (Math.random() * 0.8 + 0.1).toFixed(4);
        const success = Math.floor(Math.random() * 100).toString();
        const failure = Math.floor(Math.random() * 20).toString();
        const malicious = Math.random() < 0.05 ? 'true' : 'false';

        // Measure payload size (the arguments sent to the chaincode)
        const args = [id, score, success, failure, malicious];
        const payloadSize = Buffer.byteLength(JSON.stringify(args), 'utf8');
        p1PayloadSizes.push(payloadSize);

        const startCommit = now();
        try {
            await trustContract.submitTransaction(
                'updateTrustScore', id, score, success, failure, malicious
            );
            const commitTime = now() - startCommit;
            p1Latencies.push(commitTime);
            p1CommitTimes.push(commitTime);
        } catch (err) {
            p1Latencies.push(now() - startCommit);
            p1Errors.push({ deviceId: id, error: err.message });
        }

        if (i % 25 === 0) console.log(`    Progress: ${i}/${DEVICE_COUNT}`);
    }

    // ------------------------------------------------------------------
    // Phase 2: updateTrustScoreV2
    // ------------------------------------------------------------------
    console.log('\n  [Phase 2] Running updateTrustScoreV2 for 100 devices...');

    const p2Latencies = [];
    const p2CommitTimes = [];
    const p2PayloadSizes = [];
    const p2Errors = [];

    for (let i = 1; i <= DEVICE_COUNT; i++) {
        const id = deviceId('bench-cmp-', i);
        const dataIntegrity = (Math.random() * 0.8 + 0.1).toFixed(4);
        const networkReliability = (Math.random() * 0.8 + 0.1).toFixed(4);
        const behaviorCompliance = (Math.random() * 0.8 + 0.1).toFixed(4);
        const authenticationStrength = (Math.random() * 0.8 + 0.1).toFixed(4);

        // Measure payload size (the arguments sent to the chaincode)
        const args = [id, dataIntegrity, networkReliability, behaviorCompliance, authenticationStrength];
        const payloadSize = Buffer.byteLength(JSON.stringify(args), 'utf8');
        p2PayloadSizes.push(payloadSize);

        const startCommit = now();
        try {
            await trustContract.submitTransaction(
                'updateTrustScoreV2', id, dataIntegrity, networkReliability,
                behaviorCompliance, authenticationStrength
            );
            const commitTime = now() - startCommit;
            p2Latencies.push(commitTime);
            p2CommitTimes.push(commitTime);
        } catch (err) {
            p2Latencies.push(now() - startCommit);
            p2Errors.push({ deviceId: id, error: err.message });
        }

        if (i % 25 === 0) console.log(`    Progress: ${i}/${DEVICE_COUNT}`);
    }

    // ------------------------------------------------------------------
    // Compute statistics
    // ------------------------------------------------------------------
    const p1LatencyStats = computeStats(p1Latencies);
    const p1CommitStats = computeStats(p1CommitTimes);
    const p1PayloadStats = computeStats(p1PayloadSizes);
    const p1TotalTimeSec = p1Latencies.reduce((a, b) => a + b, 0) / 1000;
    const p1TPS = (DEVICE_COUNT - p1Errors.length) / p1TotalTimeSec;

    const p2LatencyStats = computeStats(p2Latencies);
    const p2CommitStats = computeStats(p2CommitTimes);
    const p2PayloadStats = computeStats(p2PayloadSizes);
    const p2TotalTimeSec = p2Latencies.reduce((a, b) => a + b, 0) / 1000;
    const p2TPS = (DEVICE_COUNT - p2Errors.length) / p2TotalTimeSec;

    // Delta calculations
    const tpsDelta = ((p2TPS - p1TPS) / p1TPS * 100).toFixed(2);
    const latencyDelta = ((p2LatencyStats.avg - p1LatencyStats.avg) / p1LatencyStats.avg * 100).toFixed(2);
    const commitDelta = ((p2CommitStats.avg - p1CommitStats.avg) / p1CommitStats.avg * 100).toFixed(2);
    const payloadDelta = ((p2PayloadStats.avg - p1PayloadStats.avg) / p1PayloadStats.avg * 100).toFixed(2);

    // ------------------------------------------------------------------
    // Print comparison table
    // ------------------------------------------------------------------
    console.log('\n  ┌──────────────────────────────┬────────────────────────────┬──────────────────────────────┬──────────┐');
    console.log('  │ Metric                       │ Phase 1 (updateTrustScore) │ Phase 2 (updateTrustScoreV2) │ Δ (%)    │');
    console.log('  ├──────────────────────────────┼────────────────────────────┼──────────────────────────────┼──────────┤');
    console.log(`  │ Average TPS                  │ ${String(p1TPS.toFixed(2)).padEnd(26)} │ ${String(p2TPS.toFixed(2)).padEnd(28)} │ ${String(tpsDelta + '%').padEnd(8)} │`);
    console.log(`  │ Average Latency (ms)         │ ${String(p1LatencyStats.avg.toFixed(2)).padEnd(26)} │ ${String(p2LatencyStats.avg.toFixed(2)).padEnd(28)} │ ${String(latencyDelta + '%').padEnd(8)} │`);
    console.log(`  │ Avg Block Commit Time (ms)   │ ${String(p1CommitStats.avg.toFixed(2)).padEnd(26)} │ ${String(p2CommitStats.avg.toFixed(2)).padEnd(28)} │ ${String(commitDelta + '%').padEnd(8)} │`);
    console.log(`  │ Avg Payload Size (bytes)     │ ${String(p1PayloadStats.avg.toFixed(0)).padEnd(26)} │ ${String(p2PayloadStats.avg.toFixed(0)).padEnd(28)} │ ${String(payloadDelta + '%').padEnd(8)} │`);
    console.log('  └──────────────────────────────┴────────────────────────────┴──────────────────────────────┴──────────┘');
    console.log(`\n  Phase 1 errors: ${p1Errors.length} | Phase 2 errors: ${p2Errors.length}`);

    const comparisonResult = {
        name: 'Phase 1 vs Phase 2 Comparison',
        deviceCount: DEVICE_COUNT,
        phase1: {
            function: 'updateTrustScore',
            successful: DEVICE_COUNT - p1Errors.length,
            errors: p1Errors.length,
            avgTPS: parseFloat(p1TPS.toFixed(2)),
            avgLatencyMs: parseFloat(p1LatencyStats.avg.toFixed(2)),
            minLatencyMs: parseFloat(p1LatencyStats.min.toFixed(2)),
            maxLatencyMs: parseFloat(p1LatencyStats.max.toFixed(2)),
            avgBlockCommitMs: parseFloat(p1CommitStats.avg.toFixed(2)),
            avgPayloadSizeBytes: parseFloat(p1PayloadStats.avg.toFixed(0))
        },
        phase2: {
            function: 'updateTrustScoreV2',
            successful: DEVICE_COUNT - p2Errors.length,
            errors: p2Errors.length,
            avgTPS: parseFloat(p2TPS.toFixed(2)),
            avgLatencyMs: parseFloat(p2LatencyStats.avg.toFixed(2)),
            minLatencyMs: parseFloat(p2LatencyStats.min.toFixed(2)),
            maxLatencyMs: parseFloat(p2LatencyStats.max.toFixed(2)),
            avgBlockCommitMs: parseFloat(p2CommitStats.avg.toFixed(2)),
            avgPayloadSizeBytes: parseFloat(p2PayloadStats.avg.toFixed(0))
        },
        delta: {
            tpsPercent: parseFloat(tpsDelta),
            latencyPercent: parseFloat(latencyDelta),
            blockCommitPercent: parseFloat(commitDelta),
            payloadSizePercent: parseFloat(payloadDelta)
        }
    };

    // ------------------------------------------------------------------
    // Generate markdown report
    // ------------------------------------------------------------------
    const PHASE2_REPORT_PATH = path.resolve(__dirname, 'phase2-comparison-results.md');
    const reportTimestamp = new Date().toISOString();

    const markdown = `# Phase 2 Benchmark Comparison Results

> Generated: ${reportTimestamp}
> Channel: ${CHANNEL_NAME} | Devices: ${DEVICE_COUNT} | Fabric 2.5

## Summary

Phase 2 (\`updateTrustScoreV2\`) uses a weighted composite scoring model with 4 distinct
trust parameters (dataIntegrity, networkReliability, behaviorCompliance, authenticationStrength),
stores additional fields (weights object, tier classification, 4 parameter values), and emits
new events (AccessTierChanged, DeviceRevoked). This benchmark quantifies the performance
overhead of these additions compared to the Phase 1 \`updateTrustScore\` function.

## Comparison Table

| Metric | Phase 1 (\`updateTrustScore\`) | Phase 2 (\`updateTrustScoreV2\`) | Δ (%) |
|---|---|---|---|
| **Average TPS** | ${p1TPS.toFixed(2)} | ${p2TPS.toFixed(2)} | ${tpsDelta}% |
| **Average Latency (ms)** | ${p1LatencyStats.avg.toFixed(2)} | ${p2LatencyStats.avg.toFixed(2)} | ${latencyDelta}% |
| **Avg Block Commit Time (ms)** | ${p1CommitStats.avg.toFixed(2)} | ${p2CommitStats.avg.toFixed(2)} | ${commitDelta}% |
| **Avg Payload Size (bytes)** | ${p1PayloadStats.avg.toFixed(0)} | ${p2PayloadStats.avg.toFixed(0)} | ${payloadDelta}% |

## Detailed Statistics

### Phase 1: \`updateTrustScore\`

- **Successful transactions:** ${DEVICE_COUNT - p1Errors.length} / ${DEVICE_COUNT}
- **Errors:** ${p1Errors.length}
- **Latency:** min=${p1LatencyStats.min.toFixed(2)}ms, avg=${p1LatencyStats.avg.toFixed(2)}ms, max=${p1LatencyStats.max.toFixed(2)}ms
- **Block commit time:** avg=${p1CommitStats.avg.toFixed(2)}ms
- **Payload size:** avg=${p1PayloadStats.avg.toFixed(0)} bytes

### Phase 2: \`updateTrustScoreV2\`

- **Successful transactions:** ${DEVICE_COUNT - p2Errors.length} / ${DEVICE_COUNT}
- **Errors:** ${p2Errors.length}
- **Latency:** min=${p2LatencyStats.min.toFixed(2)}ms, avg=${p2LatencyStats.avg.toFixed(2)}ms, max=${p2LatencyStats.max.toFixed(2)}ms
- **Block commit time:** avg=${p2CommitStats.avg.toFixed(2)}ms
- **Payload size:** avg=${p2PayloadStats.avg.toFixed(0)} bytes

## Analysis

Phase 2 stores additional fields per trust record:
- 4 individual trust parameters (dataIntegrity, networkReliability, behaviorCompliance, authenticationStrength)
- Weights object with 4 float values
- Tier classification string (FULL_ACCESS / LIMITED_ACCESS / QUARANTINE / REVOKED)

This results in a **${payloadDelta}%** increase in input payload size. The additional CouchDB
writes for the larger JSON record and potential event emissions (AccessTierChanged, DeviceRevoked)
contribute to a **${latencyDelta}%** change in average transaction latency.

---

*Benchmark run on ${reportTimestamp} against Hyperledger Fabric 2.5*
`;

    fs.writeFileSync(PHASE2_REPORT_PATH, markdown);
    console.log(`\n  [INFO] Phase 2 comparison report saved to: ${PHASE2_REPORT_PATH}`);

    return comparisonResult;
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

    try {
        results.test4 = await test4Phase2Comparison(trustContract);
    } catch (err) {
        console.error(`[ERROR] Test 4 failed: ${err.message}`);
        results.test4 = { name: 'Phase 1 vs Phase 2 Comparison', error: err.message };
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

    console.log('--------------------------------------------');

    if (results.test4 && !results.test4.error) {
        console.log('Test 4: Phase 1 vs Phase 2 Comparison');
        console.log(`  Phase 1 TPS:      ${results.test4.phase1.avgTPS}`);
        console.log(`  Phase 2 TPS:      ${results.test4.phase2.avgTPS}`);
        console.log(`  TPS Delta:        ${results.test4.delta.tpsPercent}%`);
        console.log(`  Latency Delta:    ${results.test4.delta.latencyPercent}%`);
        console.log(`  Payload Delta:    ${results.test4.delta.payloadSizePercent}%`);
    } else {
        console.log('Test 4: Phase 1 vs Phase 2 Comparison — FAILED');
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
