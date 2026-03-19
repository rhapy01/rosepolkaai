const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function getVar(name, fallback = undefined) {
  if (process.env[name]) return process.env[name];
  return fallback;
}

function loadBridgeArtifact() {
  const artifactPath = path.join(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "DeFAIBridgeGateway.sol",
    "DeFAIBridgeGateway.json"
  );
  return JSON.parse(fs.readFileSync(artifactPath, "utf8"));
}

async function deployBridgeTo(networkLabel, rpcUrl, chainId, artifact, privateKey, admin, treasury, flatFeeWei) {
  const provider = new ethers.JsonRpcProvider(rpcUrl, Number(chainId));
  const wallet = new ethers.Wallet(privateKey, provider);
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const feeData = await provider.getFeeData();

  const txOverrides = {};
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    // Bump fees to avoid "Priority is too low" rejections on some testnet RPCs.
    txOverrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas + 2_000_000_000n;
    txOverrides.maxFeePerGas = feeData.maxFeePerGas + 5_000_000_000n;
  } else if (feeData.gasPrice) {
    txOverrides.gasPrice = feeData.gasPrice + 2_000_000_000n;
  } else {
    txOverrides.maxPriorityFeePerGas = 2_000_000_000n;
    txOverrides.maxFeePerGas = 10_000_000_000n;
  }

  console.log(`Deploying bridge on ${networkLabel} (${chainId}) with signer ${wallet.address}`);
  const bridge = await factory.deploy(admin, treasury, flatFeeWei, txOverrides);
  await bridge.waitForDeployment();
  const addr = await bridge.getAddress();
  console.log(`${networkLabel} bridge: ${addr}`);
  return addr;
}

async function main() {
  const artifact = loadBridgeArtifact();
  const privateKey = getVar("PRIVATE_KEY");
  if (!privateKey) {
    throw new Error("Missing PRIVATE_KEY. Set with `npx hardhat vars set PRIVATE_KEY` or env var.");
  }

  const passetHubRpc = getVar("PASSET_HUB_RPC_URL", "https://testnet-passet-hub-eth-rpc.polkadot.io");
  const baseSepoliaRpc = getVar("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org");
  const sourceChainId = Number(getVar("SOURCE_CHAIN_ID", "420420417"));
  const destinationChainId = Number(getVar("DESTINATION_CHAIN_ID", "84532"));

  const walletPreview = new ethers.Wallet(privateKey);
  const admin = getVar("BRIDGE_ADMIN", walletPreview.address);
  const treasury = getVar("BRIDGE_TREASURY", walletPreview.address);
  const flatFeeWei = BigInt(getVar("BRIDGE_FLAT_FEE_WEI", ethers.parseEther("0.001").toString()));

  const passetHubBridge = await deployBridgeTo(
    "passetHub",
    passetHubRpc,
    sourceChainId,
    artifact,
    privateKey,
    admin,
    treasury,
    flatFeeWei
  );

  const baseSepoliaBridge = await deployBridgeTo(
    "baseSepolia",
    baseSepoliaRpc,
    destinationChainId,
    artifact,
    privateKey,
    admin,
    treasury,
    flatFeeWei
  );

  console.log("Bridge pair deployed.");
  console.log("Set these env vars for frontend:");
  console.log(`VITE_BRIDGE_GATEWAY_HUB=${passetHubBridge}`);
  console.log(`VITE_BRIDGE_GATEWAY_BASE=${baseSepoliaBridge}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
