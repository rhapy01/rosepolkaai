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

  // Defaults are kept in sync with `src/lib/contract.ts`
  const usdcAddr = (process.env.HUB_DEMO_USDC || "0xB5A046866F4e4FBDEc4a718A7575f6965CD68a2B").trim();
  const usdtAddr = (process.env.HUB_DEMO_USDT || "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB").trim();

  console.log("Deploying DeFAISimpleSwap as:", deployer.address);
  console.log("Network chainId:", (await ethers.provider.getNetwork()).chainId.toString());

  const Swap = await ethers.getContractFactory("DeFAISimpleSwap");
  const swap = await Swap.deploy(deployer.address, txOverrides);
  await swap.waitForDeployment();
  const swapAddr = await swap.getAddress();
  console.log("DeFAISimpleSwap deployed to:", swapAddr);

  // Configure 1:1 demo rates (USDC <-> USDT).
  const oneToOneRate = ethers.parseUnits("1", 18);
  await (await swap.setPairRate(usdcAddr, usdtAddr, oneToOneRate, txOverrides)).wait();
  await (await swap.setPairRate(usdtAddr, usdcAddr, oneToOneRate, txOverrides)).wait();
  console.log("Pair rates configured for demo USDC/USDT.");

  // Bootstrap some liquidity so swaps work immediately.
  const bootstrapLiquidity = ethers.parseUnits("50000", 18);
  const usdc = await ethers.getContractAt("MockERC20Permit", usdcAddr);
  const usdt = await ethers.getContractAt("MockERC20Permit", usdtAddr);

  await (await usdc.mint(deployer.address, bootstrapLiquidity, txOverrides)).wait();
  await (await usdt.mint(deployer.address, bootstrapLiquidity, txOverrides)).wait();
  await (await usdc.approve(swapAddr, bootstrapLiquidity, txOverrides)).wait();
  await (await usdt.approve(swapAddr, bootstrapLiquidity, txOverrides)).wait();
  await (await swap.provideLiquidity(usdcAddr, bootstrapLiquidity, txOverrides)).wait();
  await (await swap.provideLiquidity(usdtAddr, bootstrapLiquidity, txOverrides)).wait();

  console.log("Liquidity bootstrapped:", ethers.formatUnits(bootstrapLiquidity, 18), "each of USDC + USDT");
  console.log("");
  console.log("Update frontend address:");
  console.log("defaiSimpleSwap =", swapAddr);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

