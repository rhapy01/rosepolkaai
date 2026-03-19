const fs = require("fs");
const path = require("path");
const { ethers } = require("ethers");

function loadEnvFile() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!m) continue;
    const key = m[1];
    const value = m[2].replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

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

function deriveSecret(sender, userNonce, destinationChainId) {
  const salt = ethers.keccak256(ethers.toUtf8Bytes("DEFAI_BRIDGE_SECRET_V1"));
  return ethers.keccak256(
    ethers.solidityPacked(["bytes32", "address", "uint256", "uint256"], [salt, sender, userNonce, destinationChainId])
  );
}

async function main() {
  loadEnvFile();
  const privateKey = getVar("PRIVATE_KEY");
  if (!privateKey) throw new Error("Missing PRIVATE_KEY.");

  const sourceRpc = getVar("PASSET_HUB_RPC_URL", "https://services.polkadothub-rpc.com/testnet");
  const destinationRpc = getVar("BASE_SEPOLIA_RPC_URL", "https://sepolia.base.org");
  const sourceChainId = BigInt(getVar("SOURCE_CHAIN_ID", "420420417"));
  const destinationChainId = BigInt(getVar("DESTINATION_CHAIN_ID", "84532"));
  const sourceBridgeAddress = getVar("HUB_BRIDGE_GATEWAY");
  const destinationBridgeAddress = getVar("BASE_BRIDGE_GATEWAY");
  if (!sourceBridgeAddress || !destinationBridgeAddress) {
    throw new Error("Missing HUB_BRIDGE_GATEWAY or BASE_BRIDGE_GATEWAY.");
  }

  const sourceProvider = new ethers.JsonRpcProvider(sourceRpc, Number(sourceChainId));
  const destinationProvider = new ethers.JsonRpcProvider(destinationRpc, Number(destinationChainId));
  const sourceSigner = new ethers.Wallet(privateKey, sourceProvider);
  const destinationSigner = new ethers.Wallet(privateKey, destinationProvider);

  const artifact = loadBridgeArtifact();
  const sourceBridge = new ethers.Contract(sourceBridgeAddress, artifact.abi, sourceSigner);
  const destinationBridge = new ethers.Contract(destinationBridgeAddress, artifact.abi, destinationSigner);
  const sourceUsdc = (getVar("HUB_DEMO_USDC", "0xB5A046866F4e4FBDEc4a718A7575f6965CD68a2B") || "").toLowerCase();
  const sourceUsdt = (getVar("HUB_DEMO_USDT", "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB") || "").toLowerCase();
  const destinationUsdc = getVar("BASE_DEMO_USDC", "0x20C11721A3Df8ACAE892dD9CF247bb37470FD450");
  const destinationUsdt = getVar("BASE_DEMO_USDT", "0x8f6f67F7C773565F12EA5473BFca80a87F560708");

  const mapToken = (token) => {
    if (!token || token === ethers.ZeroAddress) return ethers.ZeroAddress;
    const lower = token.toLowerCase();
    if (lower === sourceUsdc && destinationUsdc) return destinationUsdc;
    if (lower === sourceUsdt && destinationUsdt) return destinationUsdt;
    return token;
  };

  let fromBlock = Number(getVar("RELAYER_FROM_BLOCK", "0"));
  if (fromBlock === 0) {
    const latest = await sourceProvider.getBlockNumber();
    fromBlock = Math.max(0, latest - 100);
  }

  const pollMs = Number(getVar("RELAYER_POLL_MS", "5000"));
  console.log("Relayer started");
  console.log("source bridge:", sourceBridgeAddress);
  console.log("destination bridge:", destinationBridgeAddress);
  console.log("from block:", fromBlock);

  while (true) {
    try {
      const toBlock = await sourceProvider.getBlockNumber();
      if (toBlock < fromBlock) {
        await new Promise((r) => setTimeout(r, pollMs));
        continue;
      }

      const events = await sourceBridge.queryFilter(sourceBridge.filters.BridgeRequested(), fromBlock, toBlock);
      for (const ev of events) {
        const {
          messageId,
          sender,
          token,
          amount,
          destinationChainId: eventDestinationChainId,
          recipient,
          userNonce,
          deadline,
          secretHash,
        } = ev.args;

        if (eventDestinationChainId !== destinationChainId) continue;

        const secret = deriveSecret(sender, userNonce, eventDestinationChainId);
        const derivedHash = ethers.keccak256(ethers.solidityPacked(["bytes32"], [secret]));
        if (derivedHash.toLowerCase() !== secretHash.toLowerCase()) {
          console.warn("Skipping event due to secret mismatch:", messageId);
          continue;
        }

        const destReq = await destinationBridge.bridgeRequests(messageId);
        if (destReq.sender === ethers.ZeroAddress) {
          const destinationToken = mapToken(token);
          const mirrorTx = await destinationBridge.mirrorBridgeRequest(
            messageId,
            sender,
            recipient,
            destinationToken,
            amount,
            sourceChainId,
            deadline,
            secretHash
          );
          await mirrorTx.wait();
          console.log("Mirrored request:", messageId, "token:", token, "=>", destinationToken);
        }

        const latestDestReq = await destinationBridge.bridgeRequests(messageId);
        if (!latestDestReq.completed) {
          const finalizeTx =
            token === ethers.ZeroAddress
              ? await destinationBridge.finalizeNative(messageId, secret)
              : await destinationBridge.finalizeERC20(messageId, secret);
          await finalizeTx.wait();
          console.log("Finalized on destination:", messageId);
        }

        const srcReq = await sourceBridge.bridgeRequests(messageId);
        if (!srcReq.completed) {
          const confirmTx = await sourceBridge.confirmProcessed(messageId, destinationChainId);
          await confirmTx.wait();
          console.log("Confirmed on source:", messageId);
        }
      }

      fromBlock = toBlock + 1;
    } catch (err) {
      console.error("Relayer loop error:", err);
    }

    await new Promise((r) => setTimeout(r, pollMs));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
