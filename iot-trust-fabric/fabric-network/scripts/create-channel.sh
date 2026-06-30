#!/bin/bash
# =============================================================================
# create-channel.sh — Create and Join the IoT Channel
# =============================================================================
# This script:
#   1. Creates the iot-channel using the CLI container
#   2. Joins peer0 to the channel
#   3. Updates the anchor peer
#   4. Verifies channel membership
#
# Prerequisites: bootstrap.sh must have been run successfully.
# Usage: ./create-channel.sh
# =============================================================================

set -e

# ---------------------------------------------------------------------------
# Color codes for status messages
# ---------------------------------------------------------------------------
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
CHANNEL_NAME="iot-channel"
ORDERER_ADDRESS="orderer.iot.example.com:7050"
ORDERER_CA="/opt/gopath/src/github.com/hyperledger/fabric/peer/crypto/ordererOrganizations/iot.example.com/orderers/orderer.iot.example.com/msp/tlscacerts/tlsca.iot.example.com-cert.pem"
CHANNEL_TX="/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/iot-channel.tx"
ANCHOR_TX="/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/IoTOrgMSPanchors.tx"
BLOCK_FILE="/opt/gopath/src/github.com/hyperledger/fabric/peer/channel-artifacts/${CHANNEL_NAME}.block"

info "============================================"
info " Creating IoT Channel: ${CHANNEL_NAME}"
info "============================================"
echo ""

# ---------------------------------------------------------------------------
# Step 1: Create the channel
# ---------------------------------------------------------------------------
info "Step 1: Creating channel '${CHANNEL_NAME}'..."

docker exec cli peer channel create \
    -o ${ORDERER_ADDRESS} \
    -c ${CHANNEL_NAME} \
    -f ${CHANNEL_TX} \
    --outputBlock ${BLOCK_FILE} \
    --tls true \
    --cafile ${ORDERER_CA}

if [ $? -eq 0 ]; then
    success "Channel '${CHANNEL_NAME}' created successfully."
else
    error "Failed to create channel '${CHANNEL_NAME}'."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 2: Join peer0 to the channel
# ---------------------------------------------------------------------------
info "Step 2: Joining peer0.iot.example.com to channel '${CHANNEL_NAME}'..."

docker exec cli peer channel join \
    -b ${BLOCK_FILE}

if [ $? -eq 0 ]; then
    success "peer0.iot.example.com joined channel '${CHANNEL_NAME}'."
else
    error "Failed to join peer0 to channel '${CHANNEL_NAME}'."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 3: Update anchor peer
# ---------------------------------------------------------------------------
info "Step 3: Updating anchor peer for IoTOrg..."

docker exec cli peer channel update \
    -o ${ORDERER_ADDRESS} \
    -c ${CHANNEL_NAME} \
    -f ${ANCHOR_TX} \
    --tls true \
    --cafile ${ORDERER_CA}

if [ $? -eq 0 ]; then
    success "Anchor peer updated for IoTOrg on channel '${CHANNEL_NAME}'."
else
    error "Failed to update anchor peer."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Verify channel membership
# ---------------------------------------------------------------------------
info "Step 4: Verifying channel membership..."
echo ""

CHANNELS=$(docker exec cli peer channel list 2>&1)
echo -e "${CYAN}Channels joined by peer0:${NC}"
echo "${CHANNELS}"
echo ""

if echo "${CHANNELS}" | grep -q "${CHANNEL_NAME}"; then
    success "Verification passed: peer0 is a member of '${CHANNEL_NAME}'."
else
    error "Verification failed: peer0 does not appear to be a member of '${CHANNEL_NAME}'."
    exit 1
fi

# Get channel info
info "Channel info:"
docker exec cli peer channel getinfo -c ${CHANNEL_NAME} 2>&1 || true
echo ""

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Channel Setup Complete!                ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
info "Channel '${CHANNEL_NAME}' is ready."
info "Next step: Deploy chaincodes with ./scripts/deploy-did.sh"
echo ""
