const { ethers } = require("hardhat");

function getVar(name, fallback) {
  return process.env[name] || fallback;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  const feeData = await ethers.provider.getFeeData();
  const txOverrides = {
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1_000_000_000n) + 5_000_000_000n,
  };

  const usdtAddress = getVar("USDT_ADDRESS", "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB");
  const stakingFactory = await ethers.getContractFactory("DeFAIStakingVault");

  console.log("Deploying USDT staking vault as:", deployer.address);
  const vault = await stakingFactory.deploy(deployer.address, usdtAddress, usdtAddress, txOverrides);
  await vault.waitForDeployment();

  console.log("DeFAIStakingVaultUSDT:", await vault.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
