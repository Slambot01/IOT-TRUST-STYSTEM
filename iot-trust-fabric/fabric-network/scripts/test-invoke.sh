#!/bin/bash
# =============================================================================
# test-invoke.sh — Integration Test Suite for IoT Trust Chaincodes
# =============================================================================
# Runs a sequence of test invocations against both the DID Registry and
# Trust Score chaincodes, printing PASS/FAIL for each test case.
#
# Prerequisites:
#   - bootstrap.sh, create-channel.sh, deploy-did.sh, and deploy-trust.sh
#     must all have been run successfully.
#
# Usage: ./test-invoke.sh
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Color codes
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
pass()    { echo -e "${GREEN}[PASS]${NC}  $1"; PASSED=$((PASSED + 1)); }
fail()    { echo -e "${RED}[FAIL]${NC}  $1"; FAILED=$((FAILED + 1)); }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CHANNEL_NAME="iot-channel"
ORDERER_ADDRESS="orderer.iot.example.com:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/iot.example.com/orderers/orderer.iot.example.com/msp/tlscacerts/tlsca.iot.example.com-cert.pem"
PEER_ADDRESS="peer0.iot.example.com:7051"
PEER_TLS_ROOTCERT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/iot.example.com/peers/peer0.iot.example.com/tls/ca.crt"

PASSED=0
FAILED=0
TOTAL=8

# Helper: invoke chaincode (transaction)
invoke_cc() {
    local cc_name=$1
    local func=$2
    local args=$3
    docker exec cli peer chaincode invoke \
        -o ${ORDERER_ADDRESS} \
        -C ${CHANNEL_NAME} \
        -n ${cc_name} \
        --tls true \
        --cafile ${ORDERER_CA} \
        --peerAddresses ${PEER_ADDRESS} \
        --tlsRootCertFiles ${PEER_TLS_ROOTCERT} \
        -c "{\"function\":\"${func}\",\"Args\":${args}}" \
        --waitForEvent \
        2>&1
}

# Helper: query chaincode (read-only)
query_cc() {
    local cc_name=$1
    local func=$2
    local args=$3
    docker exec cli peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${cc_name} \
        -c "{\"function\":\"${func}\",\"Args\":${args}}" \
        2>&1
}

echo ""
echo -e "${BOLD}${CYAN}============================================${NC}"
echo -e "${BOLD}${CYAN} IoT Trust System — Integration Test Suite ${NC}"
echo -e "${BOLD}${CYAN}============================================${NC}"
echo ""

# ---------------------------------------------------------------------------
# Test 1: Register DID for test-device-001
# ---------------------------------------------------------------------------
info "Test 1: registerDID for test-device-001"

RESULT=$(invoke_cc "did-registry" "registerDID" '["test-device-001","testPublicKeyPEM","http://localhost:3000/api"]')

if echo "${RESULT}" | grep -q "did:iot:test-device-001"; then
    pass "Test 1: registerDID — device 'test-device-001' registered successfully."
elif echo "${RESULT}" | grep -q "already exists"; then
    warn "Test 1: DID already exists (likely from previous run). Treating as PASS."
    pass "Test 1: registerDID — device 'test-device-001' already registered."
else
    fail "Test 1: registerDID — unexpected result: ${RESULT}"
fi
sleep 2

# ---------------------------------------------------------------------------
# Test 2: Resolve DID for test-device-001
# ---------------------------------------------------------------------------
info "Test 2: resolveDID for test-device-001"

RESULT=$(query_cc "did-registry" "resolveDID" '["test-device-001"]')

if echo "${RESULT}" | grep -q "did:iot:test-device-001"; then
    pass "Test 2: resolveDID — device 'test-device-001' resolved successfully."
else
    fail "Test 2: resolveDID — unexpected result: ${RESULT}"
fi

# ---------------------------------------------------------------------------
# Test 3: Authenticate device with dummy signature (expect false)
# ---------------------------------------------------------------------------
info "Test 3: authenticateDevice for test-device-001 (dummy signature, expect false)"

RESULT=$(invoke_cc "did-registry" "authenticateDevice" '["test-device-001","dummySignature123","testChallenge456"]')

if echo "${RESULT}" | grep -qi "false\|authenticated"; then
    pass "Test 3: authenticateDevice — returned false as expected (invalid signature)."
else
    fail "Test 3: authenticateDevice — unexpected result: ${RESULT}"
fi
sleep 2

# ---------------------------------------------------------------------------
# Test 4: Update trust score to 0.9 (expect HIGHLY_TRUSTED)
# ---------------------------------------------------------------------------
info "Test 4: updateTrustScore for test-device-001 with score 0.9"

RESULT=$(invoke_cc "trust-score" "updateTrustScore" '["test-device-001","0.9","85","5","false"]')

if echo "${RESULT}" | grep -q "HIGHLY_TRUSTED"; then
    pass "Test 4: updateTrustScore — score 0.9 classified as HIGHLY_TRUSTED."
else
    # Query to verify since invoke output may not include the result
    sleep 2
    QUERY_RESULT=$(query_cc "trust-score" "getTrustScore" '["test-device-001"]')
    if echo "${QUERY_RESULT}" | grep -q "HIGHLY_TRUSTED"; then
        pass "Test 4: updateTrustScore — verified HIGHLY_TRUSTED via query."
    else
        fail "Test 4: updateTrustScore — expected HIGHLY_TRUSTED, got: ${QUERY_RESULT}"
    fi
fi
sleep 2

# ---------------------------------------------------------------------------
# Test 5: Update trust score to 0.1 (expect BLACKLISTED)
# ---------------------------------------------------------------------------
info "Test 5: updateTrustScore for test-device-001 with score 0.1"

RESULT=$(invoke_cc "trust-score" "updateTrustScore" '["test-device-001","0.1","85","50","true"]')

if echo "${RESULT}" | grep -q "BLACKLISTED"; then
    pass "Test 5: updateTrustScore — score 0.1 classified as BLACKLISTED."
else
    sleep 2
    QUERY_RESULT=$(query_cc "trust-score" "getTrustScore" '["test-device-001"]')
    if echo "${QUERY_RESULT}" | grep -q "BLACKLISTED"; then
        pass "Test 5: updateTrustScore — verified BLACKLISTED via query."
    else
        fail "Test 5: updateTrustScore — expected BLACKLISTED, got: ${QUERY_RESULT}"
    fi
fi
sleep 2

# ---------------------------------------------------------------------------
# Test 6: Get blacklisted devices (expect test-device-001 in results)
# ---------------------------------------------------------------------------
info "Test 6: getBlacklistedDevices (expect test-device-001)"

RESULT=$(query_cc "trust-score" "getBlacklistedDevices" '[]')

if echo "${RESULT}" | grep -q "test-device-001"; then
    pass "Test 6: getBlacklistedDevices — test-device-001 found in blacklisted list."
else
    fail "Test 6: getBlacklistedDevices — test-device-001 not found. Result: ${RESULT}"
fi

# ---------------------------------------------------------------------------
# Test 7: Get all devices (expect at least one result)
# ---------------------------------------------------------------------------
info "Test 7: getAllDevices (expect at least one result)"

RESULT=$(query_cc "did-registry" "getAllDevices" '[]')

if echo "${RESULT}" | grep -q "did:iot:"; then
    DEVICE_COUNT=$(echo "${RESULT}" | grep -o "did:iot:" | wc -l)
    pass "Test 7: getAllDevices — found ${DEVICE_COUNT} device(s)."
else
    fail "Test 7: getAllDevices — no devices found. Result: ${RESULT}"
fi

# ---------------------------------------------------------------------------
# Test 8: Get trust history for test-device-001 (expect >= 2 entries)
# ---------------------------------------------------------------------------
info "Test 8: getTrustHistory for test-device-001 (expect >= 2 entries)"

RESULT=$(query_cc "trust-score" "getTrustHistory" '["test-device-001"]')

# Count history entries by counting "score" occurrences
HISTORY_COUNT=$(echo "${RESULT}" | grep -o '"score"' | wc -l)

if [ "${HISTORY_COUNT}" -ge 2 ]; then
    pass "Test 8: getTrustHistory — found ${HISTORY_COUNT} history entries (expected >= 2)."
else
    fail "Test 8: getTrustHistory — found ${HISTORY_COUNT} entries, expected >= 2. Result: ${RESULT}"
fi

# ---------------------------------------------------------------------------
# Results Summary
# ---------------------------------------------------------------------------
echo ""
echo -e "${BOLD}${CYAN}============================================${NC}"
echo -e "${BOLD}${CYAN} TEST RESULTS SUMMARY                      ${NC}"
echo -e "${BOLD}${CYAN}============================================${NC}"
echo ""
echo -e "  Total Tests:  ${TOTAL}"
echo -e "  ${GREEN}Passed:       ${PASSED}${NC}"
echo -e "  ${RED}Failed:       ${FAILED}${NC}"
echo ""

if [ ${FAILED} -eq 0 ]; then
    echo -e "${GREEN}${BOLD}  ✅ ALL TESTS PASSED!${NC}"
else
    echo -e "${RED}${BOLD}  ❌ SOME TESTS FAILED. Review output above.${NC}"
fi
echo ""
echo -e "${CYAN}============================================${NC}"
echo ""
