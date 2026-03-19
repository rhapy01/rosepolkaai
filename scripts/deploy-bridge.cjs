const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const flatNativeBridgeFee = ethers.parseEther("0.001");
  const feeData = await ethers.provider.getFeeData();

  const txOverrides = {};
  // Polkadot Hub testnet can reject low-priority defaults; bump EIP-1559 fees.
  txOverrides.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n;
  txOverrides.maxFeePerGas = (feeData.maxFeePerGas ?? txOverrides.maxPriorityFeePerGas) + 5_000_000_000n;

  console.log("Deploying DeFAIBridgeGateway with account:", deployer.address);
  console.log("Treasury:", deployer.address);
  console.log("Flat native bridge fee:", ethers.formatEther(flatNativeBridgeFee), "ETH");

  const Bridge = await ethers.getContractFactory("DeFAIBridgeGateway");
  const bridge = await Bridge.deploy(deployer.address, deployer.address, flatNativeBridgeFee, txOverrides);
  await bridge.waitForDeployment();

  console.log("DeFAIBridgeGateway deployed to:", await bridge.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
