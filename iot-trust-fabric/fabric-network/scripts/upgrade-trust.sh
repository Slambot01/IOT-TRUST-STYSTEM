#!/bin/bash
# =============================================================================
# upgrade-trust.sh — Upgrade the Trust Score Chaincode to Phase 2 (v2.0)
# =============================================================================
# This script repackages, reinstalls, re-approves (sequence 2), and re-commits
# the trust-score chaincode with the Phase 2 4-tier access control functions.
#
# This is an UPGRADE, not a fresh install. The chaincode was previously deployed
# at version 1.0 / sequence 1 by deploy-trust.sh. Fabric lifecycle requires
# incrementing the sequence number for each upgrade.
#
# Prerequisites:
#   - deploy-trust.sh has been run successfully (sequence 1 is committed)
#   - The Fabric network is running
#
# Usage: ./upgrade-trust.sh
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Color codes
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }
phase2()  { echo -e "${MAGENTA}[P2]${NC}   $1"; }

# ---------------------------------------------------------------------------
# Configuration — UPGRADED values
# ---------------------------------------------------------------------------
CC_NAME="trust-score"
CC_VERSION="2.0"
CC_SEQUENCE=2
CC_LABEL="${CC_NAME}_${CC_VERSION}"
CC_SRC_PATH="/opt/gopath/src/github.com/hyperledger/fabric-samples/chaincode/trust-score"
CHANNEL_NAME="iot-channel"
ORDERER_ADDRESS="orderer.iot.example.com:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/iot.example.com/orderers/orderer.iot.example.com/msp/tlscacerts/tlsca.iot.example.com-cert.pem"
PEER_ADDRESS="peer0.iot.example.com:7051"
PEER_TLS_ROOTCERT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/iot.example.com/peers/peer0.iot.example.com/tls/ca.crt"

info "============================================"
info " UPGRADING Chaincode: ${CC_NAME}"
phase2 " v1.0 (seq 1) → v${CC_VERSION} (seq ${CC_SEQUENCE})"
info "============================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Install npm dependencies
# ---------------------------------------------------------------------------
info "Step 1: Installing npm dependencies for ${CC_NAME}..."

docker exec cli bash -c "cd ${CC_SRC_PATH} && npm install --production 2>&1" || {
    warn "npm install in CLI failed, trying local install..."
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    CHAINCODE_LOCAL_DIR="$(cd "${SCRIPT_DIR}/../../chaincode/trust-score" && pwd)"
    (cd "${CHAINCODE_LOCAL_DIR}" && npm install --production)
}
success "Dependencies installed."

# ---------------------------------------------------------------------------
# Step 2: Package the chaincode with new label
# ---------------------------------------------------------------------------
info "Step 2: Packaging chaincode with label ${CC_LABEL}..."

docker exec cli peer lifecycle chaincode package ${CC_NAME}.tar.gz \
    --path ${CC_SRC_PATH} \
    --lang node \
    --label ${CC_LABEL}

if [ $? -eq 0 ]; then
    success "Chaincode packaged: ${CC_NAME}.tar.gz (label: ${CC_LABEL})"
else
    error "Failed to package chaincode."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: Install new package on peer0
# ---------------------------------------------------------------------------
info "Step 3: Installing upgraded chaincode on peer0..."

docker exec cli peer lifecycle chaincode install ${CC_NAME}.tar.gz

if [ $? -eq 0 ]; then
    success "Chaincode installed on peer0."
else
    error "Failed to install chaincode."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Query installed chaincode to get new package ID
# ---------------------------------------------------------------------------
info "Step 4: Querying installed chaincodes for new package ID..."

PACKAGE_ID=$(docker exec cli peer lifecycle chaincode queryinstalled 2>&1 \
    | grep "${CC_LABEL}" \
    | sed -n "s/^Package ID: \(.*\), Label:.*$/\1/p")

if [ -z "${PACKAGE_ID}" ]; then
    error "Could not find package ID for ${CC_LABEL}."
    error "Installed chaincodes:"
    docker exec cli peer lifecycle chaincode queryinstalled
    exit 1
fi

success "Package ID: ${PACKAGE_ID}"

# ---------------------------------------------------------------------------
# Step 5: Approve chaincode definition with INCREMENTED sequence
# ---------------------------------------------------------------------------
info "Step 5: Approving chaincode definition (sequence ${CC_SEQUENCE})..."

docker exec cli peer lifecycle chaincode approveformyorg \
    -o ${ORDERER_ADDRESS} \
    --channelID ${CHANNEL_NAME} \
    --name ${CC_NAME} \
    --version ${CC_VERSION} \
    --package-id ${PACKAGE_ID} \
    --sequence ${CC_SEQUENCE} \
    --tls true \
    --cafile ${ORDERER_CA}

if [ $? -eq 0 ]; then
    success "Chaincode definition approved for IoTOrg (sequence ${CC_SEQUENCE})."
else
    error "Failed to approve chaincode definition."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 6: Check commit readiness
# ---------------------------------------------------------------------------
info "Step 6: Checking commit readiness..."

docker exec cli peer lifecycle chaincode checkcommitreadiness \
    --channelID ${CHANNEL_NAME} \
    --name ${CC_NAME} \
    --version ${CC_VERSION} \
    --sequence ${CC_SEQUENCE} \
    --output json

# ---------------------------------------------------------------------------
# Step 7: Commit the upgraded chaincode definition
# ---------------------------------------------------------------------------
info "Step 7: Committing upgraded chaincode definition to channel..."

docker exec cli peer lifecycle chaincode commit \
    -o ${ORDERER_ADDRESS} \
    --channelID ${CHANNEL_NAME} \
    --name ${CC_NAME} \
    --version ${CC_VERSION} \
    --sequence ${CC_SEQUENCE} \
    --tls true \
    --cafile ${ORDERER_CA} \
    --peerAddresses ${PEER_ADDRESS} \
    --tlsRootCertFiles ${PEER_TLS_ROOTCERT}

if [ $? -eq 0 ]; then
    success "Chaincode definition committed to channel '${CHANNEL_NAME}'."
else
    error "Failed to commit chaincode definition."
    exit 1
fi

# Verify committed
info "Verifying committed chaincode..."
docker exec cli peer lifecycle chaincode querycommitted \
    --channelID ${CHANNEL_NAME} \
    --name ${CC_NAME}

# ---------------------------------------------------------------------------
# Step 8: Smoke test — Verify Phase 2 functions are operational
# ---------------------------------------------------------------------------
info "Step 8: Smoke-testing Phase 2 functions..."
sleep 3  # Wait for new chaincode container to start

phase2 "Testing checkAccessPermission for sensor-temp-001..."
SMOKE_RESULT=$(docker exec cli peer chaincode query \
    -C ${CHANNEL_NAME} \
    -n ${CC_NAME} \
    -c '{"function":"checkAccessPermission","Args":["sensor-temp-001"]}' \
    2>&1)

if echo "${SMOKE_RESULT}" | grep -q "allowed"; then
    success "Phase 2 smoke test PASSED: checkAccessPermission returned access decision."
    echo "  Result: ${SMOKE_RESULT}"
else
    warn "Phase 2 smoke test inconclusive. The chaincode container may still be starting."
    warn "Result: ${SMOKE_RESULT}"
    warn "Retry manually: docker exec cli peer chaincode query -C iot-channel -n trust-score -c '{\"function\":\"checkAccessPermission\",\"Args\":[\"sensor-temp-001\"]}'"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Trust Score Chaincode UPGRADED!        ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
info "Chaincode Name:    ${CC_NAME}"
phase2 "Chaincode Version: ${CC_VERSION} (was 1.0)"
phase2 "Sequence:          ${CC_SEQUENCE} (was 1)"
info "Package ID:        ${PACKAGE_ID}"
info "Channel:           ${CHANNEL_NAME}"
echo ""
phase2 "New Phase 2 Functions:"
phase2 "  • determineAccessTier (internal helper)"
phase2 "  • updateTrustScoreV2 (4-parameter weighted scoring)"
phase2 "  • checkAccessPermission (tier-based access gate)"
phase2 "  • getDevicesByTier (CouchDB rich query)"
echo ""
phase2 "New Events:"
phase2 "  • AccessTierChanged — emitted on tier transitions"
phase2 "  • DeviceRevoked — emitted when tier = REVOKED"
echo ""
info "Next: Run integration tests with ./scripts/test-invoke.sh"
echo ""
