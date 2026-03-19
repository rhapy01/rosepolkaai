const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

function readPrivateKey() {
  const envPath = path.join(__dirname, "..", ".env");
  const text = fs.readFileSync(envPath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^PRIVATE_KEY=(.*)$/);
    if (!m) continue;
    const raw = m[1].trim().replace(/^["']|["']$/g, "");
    const pk = raw.startsWith("0x") ? raw : `0x${raw}`;
    if (/^0x[0-9a-fA-F]{64}$/.test(pk)) return pk;
  }
  throw new Error("Valid PRIVATE_KEY not found in .env");
}

async function main() {
  const rpc = process.env.PASSET_HUB_RPC_URL || "https://services.polkadothub-rpc.com/testnet";
  const provider = new ethers.JsonRpcProvider(rpc);
  const wallet = new ethers.Wallet(readPrivateKey(), provider);

  const latest = await provider.getTransactionCount(wallet.address, "latest");
  const pending = await provider.getTransactionCount(wallet.address, "pending");
  console.log("Address:", wallet.address);
  console.log("latest nonce:", latest, "pending nonce:", pending);

  if (pending <= latest) {
    console.log("No pending nonce gap detected.");
    return;
  }

  const feeData = await provider.getFeeData();
  const maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas ?? ethers.parseUnits("3", "gwei")) + ethers.parseUnits("8", "gwei");
  const maxFeePerGas = (feeData.maxFeePerGas ?? ethers.parseUnits("20", "gwei")) + ethers.parseUnits("30", "gwei");

  for (let nonce = latest; nonce < pending; nonce++) {
    const tx = await wallet.sendTransaction({
      to: wallet.address,
      value: 0n,
      nonce,
      gasLimit: 21000n,
      maxPriorityFeePerGas,
      maxFeePerGas,
    });
    console.log("Replacement sent:", nonce, tx.hash);
    await tx.wait();
    console.log("Replacement mined:", nonce);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
