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

    // =========================================================================
    // PHASE 2: 4-Tier Access Control Functions
    // =========================================================================
    //
    // Tier Model:
    //   FULL_ACCESS     — score >= 0.8   (unrestricted operations)
    //   LIMITED_ACCESS   — score >= 0.5   (standard operations, no admin)
    //   QUARANTINE       — score >= 0.2   (read-only, under review)
    //   REVOKED          — score <  0.2   (all access denied)
    //
    // Composite Score Formula:
    //   score = 0.30 * dataIntegrity
    //         + 0.25 * networkReliability
    //         + 0.25 * behaviorCompliance
    //         + 0.20 * authenticationStrength
    // =========================================================================

    /**
     * Determines the access tier for a given trust score.
     *
     * This is an internal helper function (not exposed as a chaincode
     * transaction). It maps a numeric score to one of four tier strings.
     *
     * @param {number} score - Trust score in [0, 1]
     * @returns {string} One of: FULL_ACCESS, LIMITED_ACCESS, QUARANTINE, REVOKED
     */
    determineAccessTier(score) {
        if (score >= 0.8) return 'FULL_ACCESS';
        if (score >= 0.5) return 'LIMITED_ACCESS';
        if (score >= 0.2) return 'QUARANTINE';
        return 'REVOKED';
    }

    /**
     * Updates the trust score for an IoT device using the Phase 2 weighted
     * composite scoring model with four distinct trust parameters.
     *
     * Each parameter is a float in [0, 1] representing a dimension of trust:
     *   - dataIntegrity        (weight 0.30) — data accuracy and freshness
     *   - networkReliability   (weight 0.25) — uptime and connectivity
     *   - behaviorCompliance   (weight 0.25) — adherence to expected patterns
     *   - authenticationStrength (weight 0.20) — credential strength
     *
     * The composite score is clamped to [0, 1], and the device is classified
     * into one of four access tiers. History and versioning follow the same
     * conventions as the Phase 1 updateTrustScore function.
     *
     * Events Emitted:
     *   - TrustScoreUpdated   — on every update
     *   - AccessTierChanged   — when the tier differs from the previous value
     *   - DeviceRevoked       — when the new tier is REVOKED
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier
     * @param {string} dataIntegrity - Data integrity score (0–1)
     * @param {string} networkReliability - Network reliability score (0–1)
     * @param {string} behaviorCompliance - Behavior compliance score (0–1)
     * @param {string} authenticationStrength - Authentication strength score (0–1)
     * @returns {string} JSON string of the updated trust record
     * @throws {Error} If deviceId is empty or any parameter is invalid
     */
    async updateTrustScoreV2(ctx, deviceId, dataIntegrity, networkReliability, behaviorCompliance, authenticationStrength) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const params = {
            dataIntegrity: parseFloat(dataIntegrity),
            networkReliability: parseFloat(networkReliability),
            behaviorCompliance: parseFloat(behaviorCompliance),
            authenticationStrength: parseFloat(authenticationStrength)
        };

        for (const [name, value] of Object.entries(params)) {
            if (isNaN(value)) {
                throw new Error(`Invalid ${name} value: '${arguments[Object.keys(params).indexOf(name) + 1]}'. Must be a number between 0 and 1.`);
            }
            params[name] = Math.max(0, Math.min(1, value)); // Clamp to [0, 1]
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] updateTrustScoreV2 invoked by: ${clientIdentity.getID()}`);

        // --- Weighted Composite Score ---
        const weights = {
            dataIntegrity: 0.30,
            networkReliability: 0.25,
            behaviorCompliance: 0.25,
            authenticationStrength: 0.20
        };

        const compositeScore = Math.max(0, Math.min(1,
            weights.dataIntegrity * params.dataIntegrity +
            weights.networkReliability * params.networkReliability +
            weights.behaviorCompliance * params.behaviorCompliance +
            weights.authenticationStrength * params.authenticationStrength
        ));

        // --- Tier Classification ---
        const tier = this.determineAccessTier(compositeScore);

        // Map tier to Phase 1 status for backward compatibility
        let status;
        if (tier === 'REVOKED') {
            status = 'BLACKLISTED';
        } else if (tier === 'FULL_ACCESS') {
            status = 'HIGHLY_TRUSTED';
        } else {
            status = 'TRUSTED';
        }

        const trustKey = `TRUST:${deviceId}`;
        const historyKey = `HISTORY:${deviceId}`;
        const now = new Date().toISOString();

        // Get existing record for version increment and tier-change detection
        let version = 1;
        let previousTier = null;
        const existingBytes = await ctx.stub.getState(trustKey);
        if (existingBytes && existingBytes.length > 0) {
            const existingRecord = JSON.parse(existingBytes.toString());
            version = (existingRecord.version || 0) + 1;
            previousTier = existingRecord.tier || null;
        }

        // Build the trust record (superset of Phase 1 fields)
        const trustRecord = {
            deviceId: deviceId,
            score: compositeScore,
            status: status,
            tier: tier,
            dataIntegrity: params.dataIntegrity,
            networkReliability: params.networkReliability,
            behaviorCompliance: params.behaviorCompliance,
            authenticationStrength: params.authenticationStrength,
            weights: weights,
            successCount: 0,
            failureCount: 0,
            isMalicious: tier === 'REVOKED',
            updatedAt: now,
            version: version
        };

        // Save current trust score to ledger
        await ctx.stub.putState(trustKey, Buffer.from(JSON.stringify(trustRecord)));

        // --- History Management ---
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
            score: compositeScore,
            status: status,
            tier: tier,
            dataIntegrity: params.dataIntegrity,
            networkReliability: params.networkReliability,
            behaviorCompliance: params.behaviorCompliance,
            authenticationStrength: params.authenticationStrength,
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
        // Always emit TrustScoreUpdated (backward compatible with Phase 1 listeners)
        const eventPayload = {
            deviceId: deviceId,
            score: compositeScore,
            status: status,
            tier: tier,
            timestamp: now
        };
        ctx.stub.setEvent('TrustScoreUpdated', Buffer.from(JSON.stringify(eventPayload)));

        // Emit AccessTierChanged when the tier differs from previous
        if (previousTier !== null && previousTier !== tier) {
            const tierChangePayload = {
                deviceId: deviceId,
                previousTier: previousTier,
                newTier: tier,
                score: compositeScore,
                timestamp: now
            };
            ctx.stub.setEvent('AccessTierChanged', Buffer.from(JSON.stringify(tierChangePayload)));
            console.log(`[TrustScore] TIER CHANGE: Device ${deviceId} moved from ${previousTier} to ${tier}`);
        }

        // Emit DeviceRevoked when tier is REVOKED
        if (tier === 'REVOKED') {
            const revokedPayload = {
                deviceId: deviceId,
                score: compositeScore,
                reason: 'Composite trust score below revocation threshold (0.2)',
                dataIntegrity: params.dataIntegrity,
                networkReliability: params.networkReliability,
                behaviorCompliance: params.behaviorCompliance,
                authenticationStrength: params.authenticationStrength,
                timestamp: now
            };
            ctx.stub.setEvent('DeviceRevoked', Buffer.from(JSON.stringify(revokedPayload)));
            console.log(`[TrustScore] REVOKED: Device ${deviceId} access revoked (score: ${compositeScore.toFixed(4)})`);
        }

        console.log(`[TrustScore] V2 trust score updated for ${deviceId}: score=${compositeScore.toFixed(4)}, tier=${tier}, version=${version}`);
        return JSON.stringify(trustRecord);
    }

    /**
     * Checks whether a device is permitted to perform actions based on its
     * current trust score and access tier.
     *
     * REVOKED devices return allowed=false. All other tiers return allowed=true
     * with the tier indicating what level of access is appropriate.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} deviceId - The device identifier
     * @returns {string} JSON string: { allowed, tier, reason, score, deviceId }
     * @throws {Error} If deviceId is empty
     */
    async checkAccessPermission(ctx, deviceId) {
        // --- Input Validation ---
        if (!deviceId || deviceId.trim().length === 0) {
            throw new Error('deviceId is required and cannot be empty');
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] checkAccessPermission invoked by: ${clientIdentity.getID()}`);

        const trustKey = `TRUST:${deviceId}`;
        const dataBytes = await ctx.stub.getState(trustKey);

        if (!dataBytes || dataBytes.length === 0) {
            // Device has no trust record — deny by default (unscored device)
            return JSON.stringify({
                deviceId: deviceId,
                allowed: false,
                tier: 'UNKNOWN',
                score: null,
                reason: 'No trust record found. Device must be scored before accessing resources.'
            });
        }

        const record = JSON.parse(dataBytes.toString());
        const score = record.score;

        // Use stored tier if available (Phase 2 record), otherwise compute it
        const tier = record.tier || this.determineAccessTier(score);

        let allowed = true;
        let reason = '';

        if (tier === 'REVOKED') {
            allowed = false;
            reason = `Device access revoked. Trust score ${score.toFixed(4)} is below the revocation threshold (0.2).`;
        } else if (tier === 'QUARANTINE') {
            allowed = true;
            reason = `Device is in quarantine. Limited read-only access permitted. Trust score: ${score.toFixed(4)}.`;
        } else if (tier === 'LIMITED_ACCESS') {
            allowed = true;
            reason = `Standard access granted. Trust score: ${score.toFixed(4)}.`;
        } else {
            // FULL_ACCESS
            allowed = true;
            reason = `Full access granted. Trust score: ${score.toFixed(4)}.`;
        }

        console.log(`[TrustScore] checkAccessPermission for ${deviceId}: allowed=${allowed}, tier=${tier}, score=${score}`);

        return JSON.stringify({
            deviceId: deviceId,
            allowed: allowed,
            tier: tier,
            score: score,
            reason: reason
        });
    }

    /**
     * Retrieves all devices belonging to a specific access tier using a
     * CouchDB rich query.
     *
     * Valid tier values: FULL_ACCESS, LIMITED_ACCESS, QUARANTINE, REVOKED
     *
     * Note: For Phase 1 records that lack a `tier` field, this function will
     * only find devices that have been scored with updateTrustScoreV2. Use
     * getBlacklistedDevices for Phase 1 BLACKLISTED lookups.
     *
     * @async
     * @param {Context} ctx - The transaction context
     * @param {string} tier - The access tier to query for
     * @returns {string} JSON string of an array of matching device records
     * @throws {Error} If tier is empty or invalid
     */
    async getDevicesByTier(ctx, tier) {
        // --- Input Validation ---
        if (!tier || tier.trim().length === 0) {
            throw new Error('tier is required and cannot be empty');
        }

        const validTiers = ['FULL_ACCESS', 'LIMITED_ACCESS', 'QUARANTINE', 'REVOKED'];
        if (!validTiers.includes(tier)) {
            throw new Error(`Invalid tier: '${tier}'. Must be one of: ${validTiers.join(', ')}`);
        }

        const clientIdentity = ctx.clientIdentity;
        console.log(`[TrustScore] getDevicesByTier invoked by: ${clientIdentity.getID()} for tier: ${tier}`);

        const queryString = JSON.stringify({
            selector: {
                tier: tier
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
                    console.log(`[TrustScore] Error parsing tier query record: ${parseError.message}`);
                }
            }
            result = await iterator.next();
        }
        await iterator.close();

        console.log(`[TrustScore] getDevicesByTier(${tier}) returned ${allResults.length} device(s).`);
        return JSON.stringify(allResults);
    }
}

module.exports.contracts = [TrustScore];
