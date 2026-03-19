const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const feeData = await ethers.provider.getFeeData();
  const txOverrides = {
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1_000_000_000n) + 5_000_000_000n,
  };

  console.log("Deploying DeFAIAccessPassNFT as:", deployer.address);

  const nftFactory = await ethers.getContractFactory("DeFAIAccessPassNFT");
  const nft = await nftFactory.deploy(deployer.address, txOverrides);
  await nft.waitForDeployment();

  console.log("DeFAIAccessPassNFT:", await nft.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
