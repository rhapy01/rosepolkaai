const { ethers } = require("hardhat");

async function main() {
  const provider = ethers.provider;
  const privateKey = (process.env.PRIVATE_KEY || "").trim();
  if (!privateKey) throw new Error("Missing PRIVATE_KEY.");
  const wallet = new ethers.Wallet(privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`, provider);
  const deployer = wallet;
  let nextNonce = await provider.getTransactionCount(wallet.address, "pending");
  const feeData = await ethers.provider.getFeeData();
  const txOverrides = {
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1_000_000_000n) + 5_000_000_000n,
  };

  const bridgeAddress = process.env.BASE_BRIDGE_GATEWAY || "0x6B547BE75203e0C4c54071e9E9c235F36D642A06";
  if (!bridgeAddress || bridgeAddress === ethers.ZeroAddress) {
    throw new Error("Missing BASE_BRIDGE_GATEWAY.");
  }

  console.log("Deploying Base bridge tokens as:", deployer.address);
  console.log("Base bridge gateway:", bridgeAddress);

  const tokenFactory = await ethers.getContractFactory("MockERC20Permit", deployer);
  const bridgeFactory = await ethers.getContractFactory("DeFAIBridgeGateway", deployer);

  const usdc = await tokenFactory.deploy("Base Demo USDC", "bUSDC", { ...txOverrides, nonce: nextNonce++ });
  const usdt = await tokenFactory.deploy("Base Demo USDT", "bUSDT", { ...txOverrides, nonce: nextNonce++ });
  await Promise.all([usdc.waitForDeployment(), usdt.waitForDeployment()]);

  const bridge = bridgeFactory.attach(bridgeAddress);
  await bridge.setTokenSupported(await usdc.getAddress(), true, { ...txOverrides, nonce: nextNonce++ });
  await bridge.setTokenSupported(await usdt.getAddress(), true, { ...txOverrides, nonce: nextNonce++ });

  const liquidity = ethers.parseUnits("1000000", 18);
  await usdc.mint(bridgeAddress, liquidity, { ...txOverrides, nonce: nextNonce++ });
  await usdt.mint(bridgeAddress, liquidity, { ...txOverrides, nonce: nextNonce++ });

  console.log("BASE_DEMO_USDC:", await usdc.getAddress());
  console.log("BASE_DEMO_USDT:", await usdt.getAddress());
  console.log("Minted bridge liquidity per token:", liquidity.toString());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
