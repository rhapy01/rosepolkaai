const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available");

  console.log("Deploying DeFAITokenFactory with:", deployer.address);
  const factoryFactory = await ethers.getContractFactory("DeFAITokenFactory");
  const factory = await factoryFactory.deploy(deployer.address);
  await factory.waitForDeployment();

  console.log("DeFAITokenFactory deployed to:", await factory.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

