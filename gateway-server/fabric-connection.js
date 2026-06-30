const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

/**
 * Connect to Hyperledger Fabric Network
 * Reads connection-profile.json which will be provided by Member 1.
 * 
 * @param {string} channelName Name of the Fabric channel
 * @param {string} chaincodeName Name of the deployed chaincode
 * @returns {Object|null} { gateway, contract } or null if running in Simulation Mode
 */
async function connectToNetwork(channelName, chaincodeName) {
    try {
        // Assume Member 1 provides this file at '../fabric-network/connection-profile.json'
        const ccpPath = path.resolve(__dirname, '..', 'fabric-network', 'connection-profile.json');
        
        if (!fs.existsSync(ccpPath)) {
            throw new Error(`Connection profile not found at ${ccpPath}`);
        }

        const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

        // Pointing to a 'wallet' folder
        const walletPath = path.join(__dirname, 'wallet');
        const wallet = await Wallets.newFileSystemWallet(walletPath);

        const gateway = new Gateway();

        // Connect using identity 'admin', discovery disabled
        await gateway.connect(ccp, {
            wallet,
            identity: 'admin',
            discovery: { enabled: false }
        });

        // Get network and contract
        const network = await gateway.getNetwork(channelName);
        const contract = network.getContract(chaincodeName);

        return { gateway, contract };
    } catch (error) {
        console.warn(`\n[WARNING] Fabric network not available: ${error.message}`);
        console.warn(`[WARNING] Running in SIMULATION MODE. System will fall back to local in-memory storage.\n`);
        return null;
    }
}

module.exports = {
    connectToNetwork
};
