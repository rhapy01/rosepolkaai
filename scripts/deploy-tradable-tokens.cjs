const { ethers } = require("hardhat");

function inverseRate(rate1e18) {
  return (10n ** 36n) / rate1e18;
}

async function main() {
  const [deployer] = await ethers.getSigners();
  if (!deployer) throw new Error("No deployer signer available");

  const usdcAddress = process.env.USDC_ADDRESS || "0xB5A046866F4e4FBDEc4a718A7575f6965CD68a2B";
  const platformAddress = process.env.PLATFORM_ADDRESS || "0x67f679C30eD7eE3A11b82311301A20cD1448Be8C";
  const swapAddress = process.env.SWAP_ADDRESS || "0x2c2c50Ef6cE38EDF07247E21bd407c0C50a1a8Ef";

  console.log("Deploying tradable tokens as:", deployer.address);
  console.log("Platform:", platformAddress);
  console.log("Swap:", swapAddress);
  console.log("Base quote token (USDC):", usdcAddress);

  const tokenFactory = await ethers.getContractFactory("MockERC20Permit");
  const feeData = await ethers.provider.getFeeData();
  const txOverrides = {
    gasPrice: (feeData.gasPrice ?? ethers.parseUnits("2", "gwei")) + ethers.parseUnits("6", "gwei"),
  };

  const swap = await ethers.getContractAt("DeFAISimpleSwap", swapAddress);
  const platform = await ethers.getContractAt("DeFAIPlatform", platformAddress);

  const tokenAbi = [
    "function mint(address to, uint256 amount)",
    "function approve(address spender, uint256 amount) returns (bool)",
  ];
  const usdc = new ethers.Contract(usdcAddress, tokenAbi, deployer);

  const TOKENS = [
    { name: "Domain Token", symbol: "DOMAIN", rateToUsdc: "4.0" },
    { name: "TwinChain Credit", symbol: "TCC", rateToUsdc: "2.0" },
    { name: "TwinChain Credit", symbol: "TCX", rateToUsdc: "1.5" },
    { name: "TwinChain Credit", symbol: "TCH", rateToUsdc: "0.8" },
    { name: "Polkadot AI Index", symbol: "PAI", rateToUsdc: "3.2" },
    { name: "Hub Liquidity Token", symbol: "HLT", rateToUsdc: "1.1" },
    { name: "RWA Basket", symbol: "RWA", rateToUsdc: "0.6" },
    { name: "Yield Booster", symbol: "YIELD", rateToUsdc: "0.9" },
    { name: "Infra Compute", symbol: "INFRA", rateToUsdc: "1.7" },
    { name: "DeFi Carbon", symbol: "CARB", rateToUsdc: "2.4" },
  ];

  const deployed = [];
  const liquidityPerToken = ethers.parseUnits("600000", 18);
  let usdcLiquidityNeeded = 0n;

  const sendAndWait = async (label, fn) => {
    let lastErr;
    for (let i = 0; i < 4; i++) {
      try {
        const tx = await fn();
        await tx.wait();
        return;
      } catch (err) {
        lastErr = err;
        const msg = String((err && err.message) || err || "");
        const retryable =
          msg.includes("Priority is too low") ||
          msg.includes("Invalid Transaction") ||
          msg.includes("nonce too low") ||
          msg.includes("replacement transaction underpriced") ||
          msg.includes("timeout");
        if (!retryable || i === 3) throw err;
        console.log(`Retrying ${label} (${i + 1}/4)`);
        await new Promise((r) => setTimeout(r, 2500 * (i + 1)));
      }
    }
    throw lastErr;
  };

  const swapSelector = swap.interface.getFunction("swapExactInput").selector;
  const isTargetAllowed = await platform.allowedTargets(swapAddress);
  if (!isTargetAllowed) {
    await sendAndWait("allow target", () => platform.setTargetAllowed(swapAddress, true, txOverrides));
  }
  const isSelectorAllowed = await platform.allowedTargetSelectors(swapAddress, swapSelector);
  if (!isSelectorAllowed) {
    await sendAndWait("allow selector", () =>
      platform.setTargetSelectorAllowed(swapAddress, swapSelector, true, txOverrides)
    );
  }

  for (const cfg of TOKENS) {
    const token = await tokenFactory.deploy(cfg.name, cfg.symbol, txOverrides);
    await token.waitForDeployment();
    const tokenAddress = await token.getAddress();

    const rateToUsdc = ethers.parseUnits(cfg.rateToUsdc, 18);
    const rateFromToken = inverseRate(rateToUsdc);
    const tokenContract = new ethers.Contract(tokenAddress, tokenAbi, deployer);

    await sendAndWait(`${cfg.symbol} mint`, () => tokenContract.mint(swapAddress, liquidityPerToken, txOverrides));

    await sendAndWait(`${cfg.symbol} rate usdc->token`, () =>
      swap.setPairRate(usdcAddress, tokenAddress, rateToUsdc, txOverrides)
    );
    await sendAndWait(`${cfg.symbol} rate token->usdc`, () =>
      swap.setPairRate(tokenAddress, usdcAddress, rateFromToken, txOverrides)
    );

    deployed.push({ ...cfg, address: tokenAddress });
    usdcLiquidityNeeded += ethers.parseUnits("350000", 18);
    console.log(`Configured tradable token ${cfg.symbol}: ${tokenAddress}`);
  }

  await sendAndWait("usdc mint to swap", () => usdc.mint(swapAddress, usdcLiquidityNeeded, txOverrides));

  console.log("\n=== DEPLOYED TRADABLE TOKENS (Hub Testnet) ===");
  for (const t of deployed) console.log(`${t.symbol} (${t.name}): ${t.address}`);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
