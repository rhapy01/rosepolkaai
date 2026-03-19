require("@nomicfoundation/hardhat-toolbox");
require("@nomicfoundation/hardhat-verify");

const { vars } = require("hardhat/config");
const fs = require("fs");
const path = require("path");

if (!process.env.PRIVATE_KEY || /%[A-Za-z0-9_]+%/.test(String(process.env.PRIVATE_KEY))) {
  try {
    const envPath = path.join(__dirname, ".env");
    if (fs.existsSync(envPath)) {
      const envText = fs.readFileSync(envPath, "utf8");
      for (const line of envText.split(/\r?\n/)) {
        const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (!match) continue;
        const key = match[1];
        const rawValue = match[2];
        const value = rawValue.replace(/^["']|["']$/g, "");
        const hasInvalidPlaceholder = key === "PRIVATE_KEY" && /%[A-Za-z0-9_]+%/.test(String(process.env[key] || ""));
        if (!(key in process.env) || hasInvalidPlaceholder) process.env[key] = value;
      }
    }
  } catch {
    // ignore .env parse errors and continue with existing env vars.
  }
}

function normalizePrivateKey(raw) {
  if (!raw) return null;
  const trimmed = String(raw).trim().replace(/^["']|["']$/g, "");
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  return /^0x[0-9a-fA-F]{64}$/.test(prefixed) ? prefixed : null;
}

// Prefer .env/local shell key first, then fallback to hardhat vars.
const privateKey = normalizePrivateKey(process.env.PRIVATE_KEY) || normalizePrivateKey(vars.has("PRIVATE_KEY") ? vars.get("PRIVATE_KEY") : null);

/** @type {import("hardhat/config").HardhatUserConfig} */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
    },
  },
  networks: {
    passetHub: {
      url: "https://testnet-passet-hub-eth-rpc.polkadot.io",
      chainId: 420420422,
      accounts: privateKey ? [privateKey] : [],
    },
    baseSepolia: {
      url: vars.has("BASE_SEPOLIA_RPC_URL") ? vars.get("BASE_SEPOLIA_RPC_URL") : "https://sepolia.base.org",
      chainId: 84532,
      accounts: privateKey ? [privateKey] : [],
    },
    polkadotTestnet: {
      url: process.env.POLKADOT_TESTNET_RPC_URL || "https://services.polkadothub-rpc.com/testnet",
      chainId: 420420417,
      accounts: privateKey ? [privateKey] : [],
    },
  },
  etherscan: {
    apiKey: {
      passetHub: "no-api-key-needed",
    },
    customChains: [
      {
        network: "passetHub",
        chainId: 420420422,
        urls: {
          apiURL: "https://blockscout-passet-hub.parity-testnet.parity.io/api",
          browserURL: "https://blockscout-passet-hub.parity-testnet.parity.io",
        },
      },
    ],
  },
};
