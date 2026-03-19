import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const platformFeeBps = 10; // 0.1%
  const treasury = deployer.address;

  console.log("Deploying DeFAIPlatform with account:", deployer.address);
  console.log("Treasury:", treasury);
  console.log("Platform fee (bps):", platformFeeBps);

  const DeFAIPlatform = await ethers.getContractFactory("DeFAIPlatform");
  const platform = await DeFAIPlatform.deploy(deployer.address, treasury, platformFeeBps);
  await platform.waitForDeployment();
  const address = await platform.getAddress();

  console.log("DeFAIPlatform deployed to:", address);
  console.log("Owner:", deployer.address);
  console.log("Treasury:", treasury);
  console.log("Platform fee:", platformFeeBps, "bps (0.1%)");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
