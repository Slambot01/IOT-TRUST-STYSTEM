#!/bin/bash
# =============================================================================
# setup-docker.sh — Install Docker & Docker Compose on Ubuntu/Debian
# =============================================================================
# Run this script ONCE before bootstrapping the Fabric network.
# Usage: sudo ./setup-docker.sh
# =============================================================================

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'

info()    { echo -e "${CYAN}[INFO]${NC}  $1"; }
success() { echo -e "${GREEN}[OK]${NC}    $1"; }
error()   { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    error "Please run with sudo: sudo ./setup-docker.sh"
    exit 1
fi

REAL_USER="${SUDO_USER:-$USER}"

info "Installing Docker Engine and Docker Compose..."

# Remove old versions
apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true

# Install prerequisites
apt-get update
apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker official GPG key
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
chmod a+r /etc/apt/keyrings/docker.gpg

# Set up Docker repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker Engine
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Add user to docker group (so they don't need sudo)
usermod -aG docker "${REAL_USER}"

# Start Docker
systemctl start docker
systemctl enable docker

# Verify installation
docker --version
docker compose version

success "Docker installed successfully!"
info "IMPORTANT: Log out and log back in for group changes to take effect."
info "Or run: newgrp docker"
echo ""
info "Then proceed with:"
info "  cd fabric-network"
info "  ./scripts/bootstrap.sh"
echo ""
