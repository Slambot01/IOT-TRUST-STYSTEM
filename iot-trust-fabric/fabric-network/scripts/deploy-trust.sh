#!/bin/bash
# =============================================================================
# deploy-trust.sh — Deploy the Trust Score Chaincode
# =============================================================================
# This script packages, installs, approves, and commits the trust-score
# chaincode to the iot-channel. Then initializes the ledger with sample data.
#
# Prerequisites:
#   - bootstrap.sh has been run
#   - create-channel.sh has been run
#
# Usage: ./deploy-trust.sh
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Color codes
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CC_NAME="trust-score"
CC_VERSION="1.0"
CC_SEQUENCE=1
CC_LABEL="${CC_NAME}_${CC_VERSION}"
CC_SRC_PATH="/opt/gopath/src/github.com/hyperledger/fabric-samples/chaincode/trust-score"
CHANNEL_NAME="iot-channel"
ORDERER_ADDRESS="orderer.iot.example.com:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/iot.example.com/orderers/orderer.iot.example.com/msp/tlscacerts/tlsca.iot.example.com-cert.pem"
PEER_ADDRESS="peer0.iot.example.com:7051"
PEER_TLS_ROOTCERT="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/peerOrganizations/iot.example.com/peers/peer0.iot.example.com/tls/ca.crt"

info "============================================"
info " Deploying Chaincode: ${CC_NAME} v${CC_VERSION}"
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
# Step 2: Package the chaincode
# ---------------------------------------------------------------------------
info "Step 2: Packaging chaincode..."

docker exec cli peer lifecycle chaincode package ${CC_NAME}.tar.gz \
    --path ${CC_SRC_PATH} \
    --lang node \
    --label ${CC_LABEL}

if [ $? -eq 0 ]; then
    success "Chaincode packaged: ${CC_NAME}.tar.gz"
else
    error "Failed to package chaincode."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: Install on peer0
# ---------------------------------------------------------------------------
info "Step 3: Installing chaincode on peer0..."

docker exec cli peer lifecycle chaincode install ${CC_NAME}.tar.gz

if [ $? -eq 0 ]; then
    success "Chaincode installed on peer0."
else
    error "Failed to install chaincode."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Query installed chaincode to get package ID
# ---------------------------------------------------------------------------
info "Step 4: Querying installed chaincodes..."

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
# Step 5: Approve chaincode definition for IoTOrg
# ---------------------------------------------------------------------------
info "Step 5: Approving chaincode definition for IoTOrg..."

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
    success "Chaincode definition approved for IoTOrg."
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
# Step 7: Commit the chaincode definition
# ---------------------------------------------------------------------------
info "Step 7: Committing chaincode definition to channel..."

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
# Step 8: Initialize the ledger with sample data
# ---------------------------------------------------------------------------
info "Step 8: Initializing ledger with sample devices..."
sleep 3  # Wait for chaincode container to start

docker exec cli peer chaincode invoke \
    -o ${ORDERER_ADDRESS} \
    -C ${CHANNEL_NAME} \
    -n ${CC_NAME} \
    --tls true \
    --cafile ${ORDERER_CA} \
    --peerAddresses ${PEER_ADDRESS} \
    --tlsRootCertFiles ${PEER_TLS_ROOTCERT} \
    -c '{"function":"initLedger","Args":[]}'

if [ $? -eq 0 ]; then
    success "Ledger initialized with 5 sample devices."
else
    warn "initLedger invocation failed. The chaincode container may still be starting."
    warn "Wait a few seconds and retry manually."
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Trust Score Chaincode Deployed!        ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
info "Chaincode Name:    ${CC_NAME}"
info "Chaincode Version: ${CC_VERSION}"
info "Package ID:        ${PACKAGE_ID}"
info "Channel:           ${CHANNEL_NAME}"
echo ""
info "Next step: Run integration tests with ./scripts/test-invoke.sh"
echo ""
