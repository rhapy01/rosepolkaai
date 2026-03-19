/**
 * Deploy one DeFAIStakingVault per hub demo token (stakingToken = asset, rewardToken = USDT).
 * Skips USDC/USDT — reuse existing vault addresses from src/lib/contract.ts.
 *
 * Usage:
 *   npx hardhat vars set PRIVATE_KEY
 *   npx hardhat run scripts/deploy-staking-vaults-for-hub-tokens.cjs --network polkadotTestnet
 */
const hre = require("hardhat");

const REWARD_TOKEN = "0x61130d37f3E2a8FA4865a499Ad2c2C21db52b9BB"; // demoUSDT (Polkadot Hub testnet)

/** Tokens that need a new vault (USDC/USDT already have vaults in production config). */
const TOKENS_NEEDING_VAULT = [
  { symbol: "DOMAIN", token: "0xf6e551781bd19e1ED8dF95b830fB6dd1B60D79eC" },
  { symbol: "TCC", token: "0x3DfD59592B0D34b1B223a8Ef65F8B5ccbD8b580e" },
  { symbol: "TCX", token: "0xb4FE961AB3E78C2feB02aa96d90714b9409f89d4" },
  { symbol: "TCH", token: "0x8ABd2F9A893d8617a6D069ab85cD88E4bcD57D87" },
  { symbol: "PAI", token: "0x8e0b51533668D7F3006837ddD26Bcb9addcae72D" },
  { symbol: "HLT", token: "0x729CC2858C6C51098711810D9D0420b0Cffc9159" },
  { symbol: "RWA", token: "0xf075Bc673908B46059d6EFFd47b209966B38Be0B" },
  { symbol: "YIELD", token: "0x9e9A3972F0649c9e0c945D40cf44678db974Ad6B" },
  { symbol: "INFRA", token: "0x1641692A5c3207Fa5eDF4D595e80DceE1B88B119" },
  { symbol: "CARB", token: "0x1fC9e691b8D56b7E05C416796Cee818e007fEb39" },
];

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const feeData = await hre.ethers.provider.getFeeData();
  const txOverrides = {
    maxPriorityFeePerGas: (feeData.maxPriorityFeePerGas ?? 1_000_000_000n) + 2_000_000_000n,
    maxFeePerGas: (feeData.maxFeePerGas ?? 1_000_000_000n) + 5_000_000_000n,
  };

  console.log("Deploying staking vaults as:", deployer.address);
  const stakingFactory = await hre.ethers.getContractFactory("DeFAIStakingVault");

  const out = [];
  for (const { symbol, token } of TOKENS_NEEDING_VAULT) {
    const vault = await stakingFactory.deploy(deployer.address, token, REWARD_TOKEN, txOverrides);
    await vault.waitForDeployment();
    const addr = await vault.getAddress();
    out.push({ symbol, vault: addr });
    console.log(`DeFAIStakingVault${symbol}:`, addr);
  }

  console.log("\n--- Paste into src/lib/contract.ts (polkadotTestnet) ---\n");
  for (const { symbol, vault } of out) {
    const key = `defaiStakingVault${symbol}`;
    console.log(`    ${key}: "${vault}" as Address,`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
