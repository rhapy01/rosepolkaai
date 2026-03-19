const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const feeData = await ethers.provider.getFeeData();

  const txOverrides = {};
  if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
    txOverrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas + 2_000_000_000n;
    txOverrides.maxFeePerGas = feeData.maxFeePerGas + 5_000_000_000n;
  } else if (feeData.gasPrice) {
    txOverrides.gasPrice = feeData.gasPrice + 2_000_000_000n;
  }

  // Defaults kept in sync with `src/lib/contract.ts`
  const token0 = (process.env.HUB_DEMO_USDC || "0xB5A046866F4e4FBDEc4a718A7575f6965CD68a2B").trim();
  const token1 = (process.env.HUB_DEMO_USDT || "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB").trim();

  console.log("Deploying DeFAIAMMPool as:", deployer.address);
  console.log("Network chainId:", (await ethers.provider.getNetwork()).chainId.toString());
  console.log("token0:", token0);
  console.log("token1:", token1);

  const Pool = await ethers.getContractFactory("DeFAIAMMPool");
  const pool = await Pool.deploy(token0, token1, txOverrides);
  await pool.waitForDeployment();
  const poolAddr = await pool.getAddress();
  console.log("DeFAIAMMPool deployed to:", poolAddr);

  // Bootstrap pool so the demo works out-of-box.
  const bootstrap = ethers.parseUnits("10000", 18);
  const usdc = await ethers.getContractAt("MockERC20Permit", token0);
  const usdt = await ethers.getContractAt("MockERC20Permit", token1);
  await (await usdc.mint(deployer.address, bootstrap, txOverrides)).wait();
  await (await usdt.mint(deployer.address, bootstrap, txOverrides)).wait();
  await (await usdc.approve(poolAddr, bootstrap, txOverrides)).wait();
  await (await usdt.approve(poolAddr, bootstrap, txOverrides)).wait();
  await (await pool.addLiquidity(bootstrap, bootstrap, 0, 0, deployer.address, txOverrides)).wait();
  console.log("Bootstrapped liquidity:", ethers.formatUnits(bootstrap, 18), "USDC +", ethers.formatUnits(bootstrap, 18), "USDT");

  console.log("");
  console.log("Update frontend address:");
  console.log("defaiAmmPool =", poolAddr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

