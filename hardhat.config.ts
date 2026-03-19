import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import { vars } from "hardhat/config";

// Passet Hub (Polkadot Hub Testnet) — hackathon guide
// https://github.com/polkadot-developers/hackathon-guide/blob/master/polkadot-hub-devs.md
// Faucet: https://faucet.polkadot.io/?parachain=1111 (select Passet Hub on Paseo)
const config: HardhatUserConfig = {
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
      accounts: vars.has("PRIVATE_KEY") ? [vars.get("PRIVATE_KEY")] : [],
    },
    baseSepolia: {
      url: vars.has("BASE_SEPOLIA_RPC_URL") ? vars.get("BASE_SEPOLIA_RPC_URL") : "https://sepolia.base.org",
      chainId: 84532,
      accounts: vars.has("PRIVATE_KEY") ? [vars.get("PRIVATE_KEY")] : [],
    },
    // Alternative Polkadot testnet from official docs
    polkadotTestnet: {
      url: "https://services.polkadothub-rpc.com/testnet",
      chainId: 420420417,
      accounts: vars.has("PRIVATE_KEY") ? [vars.get("PRIVATE_KEY")] : [],
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

export default config;
