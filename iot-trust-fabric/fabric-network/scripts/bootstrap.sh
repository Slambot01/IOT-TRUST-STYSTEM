#!/bin/bash
# =============================================================================
# bootstrap.sh — One-Shot Setup Script for IoT Trust Fabric Network
# =============================================================================
# This script:
#   1. Checks Docker and docker-compose are installed
#   2. Downloads Fabric 2.5 binaries if not present
#   3. Generates crypto materials with cryptogen
#   4. Creates channel artifacts (genesis block + channel tx)
#   5. Starts all Docker services
#   6. Waits for services to initialise
#
# Usage: ./bootstrap.sh
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

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------
info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()    { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# ---------------------------------------------------------------------------
# Navigate to fabric-network directory (where this script's parent is)
# ---------------------------------------------------------------------------
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
FABRIC_NETWORK_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
cd "${FABRIC_NETWORK_DIR}"

info "Working directory: ${FABRIC_NETWORK_DIR}"

# ---------------------------------------------------------------------------
# Step 1: Check Docker and docker-compose are installed
# ---------------------------------------------------------------------------
info "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    error "Docker is not installed. Please install Docker 20+ first."
    error "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi
success "Docker found: $(docker --version)"

if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    success "docker-compose found: $(docker-compose --version)"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    success "docker compose (plugin) found: $(docker compose version)"
else
    error "docker-compose is not installed. Please install Docker Compose 2+ first."
    error "Visit: https://docs.docker.com/compose/install/"
    exit 1
fi

# Check Docker daemon is running
if ! docker info &> /dev/null; then
    error "Docker daemon is not running. Please start Docker first."
    exit 1
fi
success "Docker daemon is running."

# ---------------------------------------------------------------------------
# Step 2: Download Fabric binaries if not present
# ---------------------------------------------------------------------------
info "Checking for Fabric binaries..."

if [ ! -d "./bin" ] || [ ! -f "./bin/cryptogen" ]; then
    warn "Fabric binaries not found. Downloading Fabric 2.5.0 and CA 1.5.5..."
    curl -sSL https://bit.ly/2ysbOFE | bash -s -- 2.5.0 1.5.5 -d -s
    # The script downloads binaries to ./bin and config to ./config
    if [ -d "fabric-samples/bin" ]; then
        mv fabric-samples/bin ./bin 2>/dev/null || true
        mv fabric-samples/config ./config 2>/dev/null || true
        rm -rf fabric-samples
    fi
    success "Fabric binaries downloaded."
else
    success "Fabric binaries already present in ./bin"
fi

export PATH="${FABRIC_NETWORK_DIR}/bin:$PATH"
export FABRIC_CFG_PATH="${FABRIC_NETWORK_DIR}"

# Verify critical binaries exist
for tool in cryptogen configtxgen; do
    if ! command -v $tool &> /dev/null; then
        error "$tool binary not found in PATH. Please ensure Fabric binaries are installed."
        exit 1
    fi
done
success "All Fabric binaries verified."

# ---------------------------------------------------------------------------
# Step 3: Generate crypto materials
# ---------------------------------------------------------------------------
info "Generating cryptographic materials..."

if [ -d "./crypto-config" ]; then
    warn "Existing crypto-config found. Removing..."
    rm -rf ./crypto-config
fi

cryptogen generate --config=crypto-config.yaml --output=crypto-config
if [ $? -eq 0 ]; then
    success "Crypto materials generated in ./crypto-config/"
else
    error "Failed to generate crypto materials."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 4: Create channel-artifacts directory
# ---------------------------------------------------------------------------
info "Creating channel artifacts..."

mkdir -p channel-artifacts

# ---------------------------------------------------------------------------
# Step 5: Generate genesis block
# ---------------------------------------------------------------------------
info "Generating genesis block (IoTGenesis profile)..."

configtxgen -profile IoTGenesis \
    -channelID system-channel \
    -outputBlock ./channel-artifacts/genesis.block

if [ $? -eq 0 ]; then
    success "Genesis block created: ./channel-artifacts/genesis.block"
else
    error "Failed to create genesis block."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 6: Generate channel creation transaction
# ---------------------------------------------------------------------------
info "Generating channel creation transaction (IoTChannel profile)..."

configtxgen -profile IoTChannel \
    -outputCreateChannelTx ./channel-artifacts/iot-channel.tx \
    -channelID iot-channel

if [ $? -eq 0 ]; then
    success "Channel TX created: ./channel-artifacts/iot-channel.tx"
else
    error "Failed to create channel transaction."
    exit 1
fi

# Generate anchor peer update transaction
info "Generating anchor peer update transaction..."

configtxgen -profile IoTChannel \
    -outputAnchorPeersUpdate ./channel-artifacts/IoTOrgMSPanchors.tx \
    -channelID iot-channel \
    -asOrg IoTOrg

if [ $? -eq 0 ]; then
    success "Anchor peer TX created: ./channel-artifacts/IoTOrgMSPanchors.tx"
else
    error "Failed to create anchor peer transaction."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 7: Start Docker services
# ---------------------------------------------------------------------------
info "Starting Docker services..."

# Stop any existing containers
${COMPOSE_CMD} down --volumes --remove-orphans 2>/dev/null || true

${COMPOSE_CMD} up -d

if [ $? -eq 0 ]; then
    success "Docker services started."
else
    error "Failed to start Docker services."
    exit 1
fi

# ---------------------------------------------------------------------------
# Step 8: Wait for services to initialise
# ---------------------------------------------------------------------------
info "Waiting 10 seconds for services to initialise..."
sleep 10

# Verify containers are running
info "Verifying running containers..."
echo ""
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}" | grep -E "ca\.|orderer\.|peer0\.|couchdb|cli" || true
echo ""

# Check CouchDB health
if curl -s http://admin:adminpw@localhost:5984/ > /dev/null 2>&1; then
    success "CouchDB is healthy and responding."
else
    warn "CouchDB may still be starting up. Check manually with:"
    warn "  curl http://admin:adminpw@localhost:5984/_all_dbs"
fi

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} IoT Trust Network Bootstrap Complete!  ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
info "Next steps:"
info "  1. Create the channel:    ./scripts/create-channel.sh"
info "  2. Deploy DID chaincode:  ./scripts/deploy-did.sh"
info "  3. Deploy Trust chaincode: ./scripts/deploy-trust.sh"
info "  4. Run tests:             ./scripts/test-invoke.sh"
echo ""
