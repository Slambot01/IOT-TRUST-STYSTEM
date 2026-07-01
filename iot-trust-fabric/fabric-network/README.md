# IoT Trust Network — Fabric Network Setup

## 🌐 Dynamic Trust Scoring for IoT Devices on Blockchain

This directory contains all Hyperledger Fabric network configuration, deployment scripts, and connection profile for the IoT Trust System blockchain layer.

---

## Prerequisites

| Requirement        | Minimum Version | Check Command                |
|--------------------|----------------|-------------------------------|
| Docker             | 20.x+          | `docker --version`           |
| Docker Compose     | 2.x+           | `docker compose version`     |
| Node.js            | 18.x+          | `node --version`             |
| Go                 | 1.20+          | `go version`                 |
| curl               | any            | `curl --version`             |
| jq (optional)      | any            | `jq --version`               |

> **Note:** Go is required by the Fabric tools (`cryptogen`, `configtxgen`). Node.js is required for the chaincode runtime and event listener.

---

## Quick Start — Step-by-Step Commands

Run these commands **in order** from the `fabric-network/` directory:

### 1. Bootstrap the Network

```bash
chmod +x scripts/*.sh
./scripts/bootstrap.sh
```

This will:
- Check Docker and docker-compose are installed
- Download Fabric 2.5.0 binaries (if not present)
- Generate all cryptographic materials
- Create the genesis block and channel transaction
- Start all Docker containers (CA, Orderer, Peer, CouchDB, CLI)

### 2. Create the Channel

```bash
./scripts/create-channel.sh
```

This will:
- Create the `iot-channel` channel
- Join `peer0.iot.example.com` to the channel
- Update the anchor peer configuration
- Verify channel membership

### 3. Deploy the DID Registry Chaincode

```bash
./scripts/deploy-did.sh
```

This will:
- Package and install the `did-registry` chaincode on peer0
- Approve and commit the chaincode definition
- Run a test invocation to verify

### 4. Deploy the Trust Score Chaincode

```bash
./scripts/deploy-trust.sh
```

This will:
- Package and install the `trust-score` chaincode on peer0
- Approve and commit the chaincode definition
- Initialize the ledger with sample devices

### 5. Start the Event Listener

```bash
cd ../event-listener
npm install
node listener.js
```

This will:
- Connect to the Fabric gateway
- Subscribe to chaincode events (DID + Trust Score)
- Start a WebSocket server on port 8080
- Forward blockchain events to connected WebSocket clients

### 6. Run Integration Tests

```bash
./scripts/test-invoke.sh
```

---

## Verification Checklist

After completing all steps, verify everything is working:

| Check                           | Command / Action                                              | Expected Result                      |
|---------------------------------|---------------------------------------------------------------|--------------------------------------|
| Docker containers running       | `docker ps`                                                   | 5 containers (ca, orderer, peer0, couchdb0, cli) |
| CouchDB accessible             | `curl http://admin:adminpw@localhost:5984/_all_dbs`           | JSON array with channel databases    |
| Channel created                 | `docker exec cli peer channel list`                           | Shows `iot-channel`                  |
| DID chaincode deployed          | Via test-invoke.sh                                            | DID registration returns success     |
| Trust chaincode deployed        | Via test-invoke.sh                                            | Trust score update returns success   |
| Event listener running          | `npx wscat -c ws://localhost:8080`                            | WebSocket connection opens           |

---

## Sharing `connection-profile.json` with Member 2

The `connection-profile.json` file is the gateway configuration that Member 2 (backend developer) needs to connect their Node.js backend to the Fabric network.

### Steps for Member 2:

1. **Copy** `connection-profile.json` to their backend project.

2. **Update paths**: Replace the placeholder paths in the JSON with absolute paths to the crypto materials on their machine:
   ```
   path/to/crypto-config/peerOrganizations/iot.example.com/...
   ```
   becomes:
   ```
   /absolute/path/to/iot-trust-fabric/fabric-network/crypto-config/peerOrganizations/iot.example.com/...
   ```

3. **Ensure network access**: If running on separate machines, update `localhost` references to the actual host IP.

4. **Install the Fabric SDK**:
   ```bash
   npm install fabric-network@2.5.0 fabric-ca-client@2.5.0
   ```

---

## Network Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    IoT Trust Network                     │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │   Fabric CA   │  │   Orderer    │  │   CouchDB    │  │
│  │  :7054        │  │  :7050       │  │  :5984       │  │
│  └──────────────┘  └──────────────┘  └──────────────┘  │
│                           │                  │           │
│                    ┌──────────────┐           │           │
│                    │   Peer0      │───────────┘           │
│                    │  :7051       │                       │
│                    │  :7053       │                       │
│                    └──────────────┘                       │
│                           │                              │
│              ┌────────────┴────────────┐                 │
│              │                         │                 │
│     ┌────────────────┐     ┌────────────────┐           │
│     │  DID Registry  │     │  Trust Score   │           │
│     │  Chaincode     │     │  Chaincode     │           │
│     └────────────────┘     └────────────────┘           │
│                                                          │
└─────────────────────────────────────────────────────────┘
              │
     ┌────────────────┐
     │ Event Listener │ ──── WebSocket :8080
     └────────────────┘
              │
     ┌────────────────┐
     │  Backend API   │ (Member 2)
     └────────────────┘
              │
     ┌────────────────┐
     │  Dashboard UI  │ (Member 3)
     └────────────────┘
```

---

## Troubleshooting

### Network fails to start

1. **Check Docker resources**: Ensure Docker has at least 4 GB of RAM allocated.
   ```bash
   docker system info | grep -i memory
   ```

2. **Port conflicts**: Ensure ports 7050, 7051, 7053, 7054, and 5984 are free.
   ```bash
   sudo lsof -i :7050 -i :7051 -i :7053 -i :7054 -i :5984
   ```

3. **Clean restart**: Tear down everything and start fresh:
   ```bash
   docker-compose down --volumes --remove-orphans
   docker volume prune -f
   docker network prune -f
   rm -rf crypto-config/ channel-artifacts/
   ./scripts/bootstrap.sh
   ```

4. **Check container logs**:
   ```bash
   docker logs orderer.iot.example.com
   docker logs peer0.iot.example.com
   docker logs ca.iot.example.com
   docker logs couchdb0
   ```

### Chaincode deployment fails

1. **Check if Node.js chaincode image is available**:
   ```bash
   docker images | grep fabric-nodeenv
   ```

2. **Ensure chaincode dependencies are installed** (in the chaincode directory):
   ```bash
   cd ../chaincode/did-registry && npm install
   cd ../chaincode/trust-score && npm install
   ```

3. **View chaincode container logs**:
   ```bash
   docker logs $(docker ps -q --filter name=dev-peer0)
   ```

### CouchDB issues

1. **Check CouchDB health**:
   ```bash
   curl http://admin:adminpw@localhost:5984/
   ```

2. **View all databases**:
   ```bash
   curl http://admin:adminpw@localhost:5984/_all_dbs
   ```

3. **Access Fauxton UI** (CouchDB web interface):
   Open `http://localhost:5984/_utils/` in your browser (login: admin / adminpw)

---

## File Structure

```
fabric-network/
├── crypto-config.yaml        # Crypto material generation config
├── configtx.yaml             # Channel and org configuration
├── docker-compose.yaml       # Docker services definition
├── connection-profile.json   # SDK connection profile for Member 2
├── README.md                 # This file
├── scripts/
│   ├── bootstrap.sh          # One-shot network setup
│   ├── create-channel.sh     # Channel creation and peer join
│   ├── deploy-did.sh         # DID Registry chaincode deployment
│   ├── deploy-trust.sh       # Trust Score chaincode deployment
│   └── test-invoke.sh        # Integration test invocations
├── crypto-config/            # (Generated) Crypto materials
└── channel-artifacts/        # (Generated) Genesis block and channel TX
```

---

## Team Coordination

| Member   | Role                  | Relevant Files                                    |
|----------|-----------------------|---------------------------------------------------|
| Member 1 | Blockchain Developer  | Everything in this directory + chaincode/          |
| Member 2 | Backend Developer     | `connection-profile.json`, event-listener output   |
| Member 3 | Frontend Developer    | WebSocket events on ws://localhost:8080            |
