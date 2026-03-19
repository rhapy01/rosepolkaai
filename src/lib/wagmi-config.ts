import { http, createConfig } from "wagmi";
import { defineChain } from "viem";
import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import { HUB_CHAIN_ID, BASE_SEPOLIA_CHAIN_ID } from "@/lib/contract";

// Passet Hub (Polkadot Hub Testnet) — per hackathon guide
// https://github.com/polkadot-developers/hackathon-guide/blob/master/polkadot-hub-devs.md
// Chainlist: https://chainlist.org/?search=passet | Faucet: https://faucet.polkadot.io/?parachain=1111
export const polkadotHub = defineChain({
  id: HUB_CHAIN_ID,
  name: "Polkadot Hub Testnet",
  nativeCurrency: { name: "DOT", symbol: "DOT", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://eth-rpc-testnet.polkadot.io/", "https://services.polkadothub-rpc.com/testnet/"] },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://blockscout-passet-hub.parity-testnet.parity.io",
    },
  },
  testnet: true,
});

export const baseSepolia = defineChain({
  id: BASE_SEPOLIA_CHAIN_ID,
  name: "Base Sepolia",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://sepolia.base.org"] },
  },
  blockExplorers: {
    default: {
      name: "Basescan",
      url: "https://sepolia.basescan.org",
    },
  },
  testnet: true,
});

export const config = getDefaultConfig({
  appName: "DeFAI - Polkadot Hub",
  projectId: "defai-polkadot-hub-hackathon",
  chains: [polkadotHub, baseSepolia],
  transports: {
    [polkadotHub.id]: http(),
    [baseSepolia.id]: http(),
  },
});
