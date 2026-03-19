const { ethers } = require("hardhat");

function getVar(name, fallback) {
  return process.env[name] || fallback;
}

async function main() {
  const swapAddress = getVar("SWAP_ADDRESS", "0x2c2c50Ef6cE38EDF07247E21bd407c0C50a1a8Ef");
  const usdcAddress = getVar("USDC_ADDRESS", "0xB5A046866F4e4FBDEc4a718A7575f6965CD68a2B");
  const usdtAddress = getVar("USDT_ADDRESS", "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB");
  const rateRaw = getVar("SWAP_RATE_1E18", ethers.parseUnits("1", 18).toString());
  const liquidityRaw = getVar("SWAP_LIQUIDITY", ethers.parseUnits("500000", 18).toString());

  const [deployer] = await ethers.getSigners();
  const feeData = await ethers.provider.getFeeData();
  const txOverrides = {
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1_000_000_000n) + 5_000_000_000n,
  };

  console.log("Initializing swap as:", deployer.address);
  console.log("Swap:", swapAddress);
  console.log("USDC:", usdcAddress);
  console.log("USDT:", usdtAddress);

  const swap = await ethers.getContractAt("DeFAISimpleSwap", swapAddress);
  const tokenAbi = [
    "function mint(address to, uint256 amount)",
    "function approve(address spender, uint256 amount) returns (bool)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
  ];
  const usdc = new ethers.Contract(usdcAddress, tokenAbi, deployer);
  const usdt = new ethers.Contract(usdtAddress, tokenAbi, deployer);

  const rate = BigInt(rateRaw);
  const liquidityAmount = BigInt(liquidityRaw);

  const currentUsdcToUsdt = await swap.pairRate(usdcAddress, usdtAddress);
  if (currentUsdcToUsdt === 0n) {
    const tx = await swap.setPairRate(usdcAddress, usdtAddress, rate, txOverrides);
    await tx.wait();
    console.log("Set pair rate USDC -> USDT");
  } else {
    console.log("USDC -> USDT rate already set:", currentUsdcToUsdt.toString());
  }

  const currentUsdtToUsdc = await swap.pairRate(usdtAddress, usdcAddress);
  if (currentUsdtToUsdc === 0n) {
    const tx = await swap.setPairRate(usdtAddress, usdcAddress, rate, txOverrides);
    await tx.wait();
    console.log("Set pair rate USDT -> USDC");
  } else {
    console.log("USDT -> USDC rate already set:", currentUsdtToUsdc.toString());
  }

  const usdcBalance = await usdc.balanceOf(deployer.address);
  if (usdcBalance < liquidityAmount) {
    const mintTx = await usdc.mint(deployer.address, liquidityAmount - usdcBalance, txOverrides);
    await mintTx.wait();
    console.log("Minted USDC to deployer");
  }

  const usdtBalance = await usdt.balanceOf(deployer.address);
  if (usdtBalance < liquidityAmount) {
    const mintTx = await usdt.mint(deployer.address, liquidityAmount - usdtBalance, txOverrides);
    await mintTx.wait();
    console.log("Minted USDT to deployer");
  }

  const usdcAllowance = await usdc.allowance(deployer.address, swapAddress);
  if (usdcAllowance < liquidityAmount) {
    const approveTx = await usdc.approve(swapAddress, liquidityAmount, txOverrides);
    await approveTx.wait();
    console.log("Approved USDC for swap");
  }

  const usdtAllowance = await usdt.allowance(deployer.address, swapAddress);
  if (usdtAllowance < liquidityAmount) {
    const approveTx = await usdt.approve(swapAddress, liquidityAmount, txOverrides);
    await approveTx.wait();
    console.log("Approved USDT for swap");
  }

  const addUsdcTx = await swap.addLiquidity(usdcAddress, liquidityAmount, txOverrides);
  await addUsdcTx.wait();
  console.log("Added USDC liquidity");

  const addUsdtTx = await swap.addLiquidity(usdtAddress, liquidityAmount, txOverrides);
  await addUsdtTx.wait();
  console.log("Added USDT liquidity");

  console.log("Swap pair initialization complete.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
