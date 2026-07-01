'use strict';

const { Contract } = require('fabric-contract-api');

/**
 * TrustScore — Hyperledger Fabric Smart Contract for IoT Device Trust Management
 *
 * This chaincode manages EWMA-based trust scores for IoT devices. It stores
 * current scores, maintains a capped history (last 100 entries), classifies
 * devices based on score thresholds, and provides rich query support via CouchDB.
 *
 * Trust Classification:
 *   - score < 0.2   → BLACKLISTED
 *   - score >= 0.8  → HIGHLY_TRUSTED
 *   - otherwise     → TRUSTED
 *
 * Ledger Key Schema:
 *   - Current score:  "TRUST:{deviceId}"   → JSON trust record
 *   - Score history:  "HISTORY:{deviceId}" → JSON array of historical entries
 *
 * Events Emitted:
 *   - TrustScoreUpdated  — On every trust score update
 *   - DeviceBlacklisted  — When a device's status becomes BLACKLISTED
 *
 * @class TrustScore
 * @extends {Contract}
 */
class TrustScore extends Contract {

    constructor() {
        super('TrustScore');
    }

    /**
     * Initializes the ledger with 5 sample IoT devices at neutral trust score (0.5).
     *
     * This function is intended for testing and demonstration purposes.
     * It creates devices: sensor-temp-001 through sensor-temp-005.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @returns {string} JSON string confirming initialization
     */
    async initLedger(ctx) {
        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] initLedger invoked by: ${clientIdentity.getID()}`);

        const sampleDevices = [
            { id: 'sensor-temp-001', score: 0.5, success: 50, failure: 10, malicious: false },
            { id: 'sensor-temp-002', score: 0.5, success: 45, failure: 15, malicious: false },
            { id: 'sensor-temp-003', score: 0.5, success: 60, failure: 5,  malicious: false },
            { id: 'sensor-temp-004', score: 0.5, success: 30, failure: 20, malicious: false },
            { id: 'sensor-temp-005', score: 0.5, success: 55, failure: 8,  malicious: false }
        ];

        const results = [];
        for (const device of sampleDevices) {
            const result = await this.updateTrustScore(
                ctx,
                device.id,
                device.score.toString(),
                device.success.toString(),
                device.failure.toString(),
                device.malicious.toString()
            );
            results.push(JSON.parse(result));
        }

        console.log(`[TrustScore] Ledger initialized with ${sampleDevices.length} sample devices.`);
        return JSON.stringify({
            message: `Ledger initialized with ${sampleDevices.length} sample devices`,
            devices: results
        });
    }

    /**
     * Updates the trust score for an IoT device.
     *
     * The score is clamped to [0, 1] and the device is classified based on
     * configurable thresholds. A version counter is incremented on each update.
     * The last 100 history entries are maintained.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier
     * @param {string} score - Trust score as a string (will be parsed as float, clamped to [0,1])
     * @param {string} successCount - Number of successful interactions
     * @param {string} failureCount - Number of failed interactions
     * @param {string} isMalicious - Whether the device is flagged as malicious ("true"/"false")
     * @returns {string} JSON string of the updated trust record
     * @throws {Error} If deviceId is empty
     * @throws {Error} If score is not a valid number
     */
    async updateTrustScore(ctx, deviceId, score, successCount, failureCount, isMalicious) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const parsedScore = parseFloat(score);
        if (isNaN(parsedScore)) {
            throw new Error(`Invalid score value: '${score}'. Must be a number between 0 and 1.`);
        }

        const parsedSuccess = parseInt(successCount, 10);
        if (isNaN(parsedSuccess) || parsedSuccess < 0) {
            throw new Error(`Invalid successCount: '${successCount}'. Must be a non-negative integer.`);
        }

        const parsedFailure = parseInt(failureCount, 10);
        if (isNaN(parsedFailure) || parsedFailure < 0) {
            throw new Error(`Invalid failureCount: '${failureCount}'. Must be a non-negative integer.`);
        }

        const maliciousFlag = isMalicious === 'true' || isMalicious === true;

        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] updateTrustScore invoked by: ${clientIdentity.getID()}`);

        // Clamp score to [0, 1]
        const clampedScore = Math.max(0, Math.min(1, parsedScore));

        // Classify the device
        let status;
        if (clampedScore < 0.2) {
            status = 'BLACKLISTED';
        } else if (clampedScore >= 0.8) {
            status = 'HIGHLY_TRUSTED';
        } else {
            status = 'TRUSTED';
        }

        const trustKey = `TRUST:${deviceId}`;
        const historyKey = `HISTORY:${deviceId}`;
        const now = new Date().toISOString();

        // Get existing record to increment version
        let version = 1;
        const existingBytes = await ctx.stub.getState(trustKey);
        if (existingBytes && existingBytes.length > 0) {
            const existingRecord = JSON.parse(existingBytes.toString());
            version = (existingRecord.version || 0) + 1;
        }

        // Build the trust record
        const trustRecord = {
            deviceId: deviceId,
            score: clampedScore,
            status: status,
            successCount: parsedSuccess,
            failureCount: parsedFailure,
            isMalicious: maliciousFlag,
            updatedAt: now,
            version: version
        };

        // Save current trust score to ledger
        await ctx.stub.putState(trustKey, Buffer.from(JSON.stringify(trustRecord)));

        // --- History Management ---
        // Append to history array, keep only the last 100 entries
        let history = [];
        const historyBytes = await ctx.stub.getState(historyKey);
        if (historyBytes && historyBytes.length > 0) {
            try {
                history = JSON.parse(historyBytes.toString());
            } catch (parseError) {
                console.log(`[TrustScore] Error parsing history for ${deviceId}, resetting: ${parseError.message}`);
                history = [];
            }
        }

        const historyEntry = {
            score: clampedScore,
            status: status,
            successCount: parsedSuccess,
            failureCount: parsedFailure,
            isMalicious: maliciousFlag,
            timestamp: now,
            version: version
        };

        history.push(historyEntry);

        // Keep only the last 100 entries
        if (history.length > 100) {
            history = history.slice(history.length - 100);
        }

        await ctx.stub.putState(historyKey, Buffer.from(JSON.stringify(history)));

        // --- Event Emission ---
        // Always emit TrustScoreUpdated
        const eventPayload = {
            deviceId: deviceId,
            score: clampedScore,
            status: status,
            timestamp: now
        };
        ctx.stub.setEvent('TrustScoreUpdated', Buffer.from(JSON.stringify(eventPayload)));

        // Additionally emit DeviceBlacklisted if status is BLACKLISTED
        if (status === 'BLACKLISTED') {
            const blacklistPayload = {
                deviceId: deviceId,
                score: clampedScore,
                reason: maliciousFlag ? 'Malicious activity detected' : 'Trust score below threshold',
                timestamp: now
            };
            ctx.stub.setEvent('DeviceBlacklisted', Buffer.from(JSON.stringify(blacklistPayload)));
            console.log(`[TrustScore] ALERT: Device ${deviceId} has been BLACKLISTED (score: ${clampedScore})`);
        }

        console.log(`[TrustScore] Trust score updated for ${deviceId}: score=${clampedScore}, status=${status}, version=${version}`);
        return JSON.stringify(trustRecord);
    }

    /**
     * Retrieves the current trust score record for a device.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier
     * @returns {string} JSON string of the trust record
     * @throws {Error} If deviceId is empty
     * @throws {Error} If no trust record exists for the device
     */
    async getTrustScore(ctx, deviceId) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] getTrustScore invoked by: ${clientIdentity.getID()}`);

        const trustKey = `TRUST:${deviceId}`;
        const dataBytes = await ctx.stub.getState(trustKey);

        if (!dataBytes || dataBytes.length === 0) {
            throw new Error(`Trust score not found for device '${deviceId}'. The device may not have been scored yet.`);
        }

        const record = JSON.parse(dataBytes.toString());
        console.log(`[TrustScore] getTrustScore for ${deviceId}: score=${record.score}, status=${record.status}`);
        return JSON.stringify(record);
    }

    /**
     * Retrieves the trust score history for a device.
     *
     * Returns the stored history array (up to 100 entries). Returns an empty
     * array if no history exists.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier
     * @returns {string} JSON string of the history array
     * @throws {Error} If deviceId is empty
     */
    async getTrustHistory(ctx, deviceId) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] getTrustHistory invoked by: ${clientIdentity.getID()}`);

        const historyKey = `HISTORY:${deviceId}`;
        const historyBytes = await ctx.stub.getState(historyKey);

        if (!historyBytes || historyBytes.length === 0) {
            console.log(`[TrustScore] No history found for device '${deviceId}'. Returning empty array.`);
            return JSON.stringify([]);
        }

        const history = JSON.parse(historyBytes.toString());
        console.log(`[TrustScore] getTrustHistory for ${deviceId}: ${history.length} entries`);
        return JSON.stringify(history);
    }

    /**
     * Retrieves all blacklisted devices using a CouchDB rich query.
     *
     * Uses ctx.stub.getQueryResult with a Mango selector to find all
     * trust records with status "BLACKLISTED".
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @returns {string} JSON string of an array of blacklisted device records
     */
    async getBlacklistedDevices(ctx) {
        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] getBlacklistedDevices invoked by: ${clientIdentity.getID()}`);

        const queryString = JSON.stringify({
            selector: {
                status: 'BLACKLISTED'
            }
        });

        const allResults = [];
        const iterator = await ctx.stub.getQueryResult(queryString);

        let result = await iterator.next();
        while (!result.done) {
            const record = result.value;
            if (record && record.value && record.value.toString().length > 0) {
                try {
                    const jsonRecord = JSON.parse(record.value.toString('utf8'));
                    allResults.push(jsonRecord);
                } catch (parseError) {
                    console.log(`[TrustScore] Error parsing blacklisted record: ${parseError.message}`);
                }
            }
            result = await iterator.next();
        }
        await iterator.close();

        console.log(`[TrustScore] getBlacklistedDevices returned ${allResults.length} device(s).`);
        return JSON.stringify(allResults);
    }

    /**
     * Retrieves all trust score records from the ledger.
     *
     * Uses a range query over all keys starting with "TRUST:" to collect
     * every device's current trust record.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @returns {string} JSON string of an array of all trust score records
     */
    async getAllTrustScores(ctx) {
        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] getAllTrustScores invoked by: ${clientIdentity.getID()}`);

        const allResults = [];
        const iterator = await ctx.stub.getStateByRange('TRUST:', 'TRUST:~');

        let result = await iterator.next();
        while (!result.done) {
            const record = result.value;
            if (record && record.value && record.value.toString().length > 0) {
                try {
                    const jsonRecord = JSON.parse(record.value.toString('utf8'));
                    allResults.push(jsonRecord);
                } catch (parseError) {
                    console.log(`[TrustScore] Error parsing trust record: ${parseError.message}`);
                }
            }
            result = await iterator.next();
        }
        await iterator.close();

        console.log(`[TrustScore] getAllTrustScores returned ${allResults.length} record(s).`);
        return JSON.stringify(allResults);
    }
}

module.exports.contracts = [TrustScore];
