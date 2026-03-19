const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  const feeData = await ethers.provider.getFeeData();
  const txOverrides = {
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1_000_000_000n) + 5_000_000_000n,
  };

  console.log("Deploying full app suite as:", deployer.address);

  const tokenFactory = await ethers.getContractFactory("MockERC20Permit");
  const platformFactory = await ethers.getContractFactory("DeFAIPlatform");
  const bridgeFactory = await ethers.getContractFactory("DeFAIBridgeGateway");
  const stakingFactory = await ethers.getContractFactory("DeFAIStakingVault");
  const nftFactory = await ethers.getContractFactory("DeFAIAccessPassNFT");
  const swapFactory = await ethers.getContractFactory("DeFAISimpleSwap");

  const usdc = await tokenFactory.deploy("Demo USDC", "dUSDC", txOverrides);
  const usdt = await tokenFactory.deploy("Demo USDT", "dUSDT", txOverrides);

  const platform = await platformFactory.deploy(deployer.address, deployer.address, 100n, txOverrides);
  const bridge = await bridgeFactory.deploy(deployer.address, deployer.address, ethers.parseEther("0.001"), txOverrides);
  const stakingUsdc = await stakingFactory.deploy(
    deployer.address,
    await usdc.getAddress(),
    await usdt.getAddress(),
    txOverrides
  );
  const stakingUsdt = await stakingFactory.deploy(
    deployer.address,
    await usdt.getAddress(),
    await usdt.getAddress(),
    txOverrides
  );
  const nft = await nftFactory.deploy(deployer.address, txOverrides);
  const swap = await swapFactory.deploy(deployer.address, txOverrides);

  await Promise.all([
    usdc.waitForDeployment(),
    usdt.waitForDeployment(),
    platform.waitForDeployment(),
    bridge.waitForDeployment(),
    stakingUsdc.waitForDeployment(),
    stakingUsdt.waitForDeployment(),
    nft.waitForDeployment(),
    swap.waitForDeployment(),
  ]);

  const swapSelector = swap.interface.getFunction("swapExactInput").selector;
  await platform.setTargetAllowed(await swap.getAddress(), true);
  await platform.setTargetSelectorAllowed(await swap.getAddress(), swapSelector, true);

  await bridge.setTokenSupported(await usdc.getAddress(), true);
  await bridge.setTokenSupported(await usdt.getAddress(), true);

  // Initialize swap pairs and demo liquidity so swaps work immediately.
  const oneToOneRate = ethers.parseUnits("1", 18);
  await swap.setPairRate(await usdc.getAddress(), await usdt.getAddress(), oneToOneRate, txOverrides);
  await swap.setPairRate(await usdt.getAddress(), await usdc.getAddress(), oneToOneRate, txOverrides);

  const bootstrapLiquidity = ethers.parseUnits("500000", 18);
  await usdc.mint(deployer.address, bootstrapLiquidity, txOverrides);
  await usdt.mint(deployer.address, bootstrapLiquidity, txOverrides);
  await usdc.approve(await swap.getAddress(), bootstrapLiquidity, txOverrides);
  await usdt.approve(await swap.getAddress(), bootstrapLiquidity, txOverrides);
  await swap.addLiquidity(await usdc.getAddress(), bootstrapLiquidity, txOverrides);
  await swap.addLiquidity(await usdt.getAddress(), bootstrapLiquidity, txOverrides);

  console.log("Demo USDC:", await usdc.getAddress());
  console.log("Demo USDT:", await usdt.getAddress());
  console.log("DeFAIPlatform:", await platform.getAddress());
  console.log("DeFAIBridgeGateway:", await bridge.getAddress());
  console.log("DeFAIStakingVaultUSDC:", await stakingUsdc.getAddress());
  console.log("DeFAIStakingVaultUSDT:", await stakingUsdt.getAddress());
  console.log("DeFAIAccessPassNFT:", await nft.getAddress());
  console.log("DeFAISimpleSwap:", await swap.getAddress());
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
