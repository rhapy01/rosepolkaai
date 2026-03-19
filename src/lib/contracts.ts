import { type Address, type Abi } from "viem";
import { CONTRACTS, BASE_SEPOLIA_CHAIN_ID as BASE_SEPOLIA_CHAIN_ID_VALUE } from "@/lib/contract";

// ERC-20 ABI (standard subset)
export const ERC20_ABI: Abi = [
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "transfer",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "approve",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    name: "allowance",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "decimals",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
];

// DeFAI Simple Swap ABI
export const DEFAI_SIMPLE_SWAP_ABI: Abi = [
  {
    name: "pairRate",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "swapExactInput",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
      { name: "amountOutMin", type: "uint256" },
      { name: "recipient", type: "address" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
  {
    name: "quote",
    type: "function",
    stateMutability: "view",
    inputs: [
      { name: "tokenIn", type: "address" },
      { name: "tokenOut", type: "address" },
      { name: "amountIn", type: "uint256" },
    ],
    outputs: [{ name: "amountOut", type: "uint256" }],
  },
];

// DeFAI Staking Vault ABI (execution subset)
export const DEFAI_STAKING_VAULT_ABI: Abi = [
  {
    name: "stakingToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "rewardToken",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
  {
    name: "userInfo",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "", type: "address" }],
    outputs: [
      { name: "amount", type: "uint256" },
      { name: "rewardDebt", type: "uint256" },
      { name: "pendingRewards", type: "uint256" },
    ],
  },
  {
    name: "pendingRewards",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "pending", type: "uint256" }],
  },
  {
    name: "stake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "unstake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    name: "claim",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [{ name: "claimAmount", type: "uint256" }],
  },
];

// Polkadot Hub Staking Precompile ABI
export const STAKING_PRECOMPILE_ABI: Abi = [
  {
    name: "stake",
    type: "function",
    stateMutability: "payable",
    inputs: [{ name: "validator", type: "bytes32" }],
    outputs: [{ name: "success", type: "bool" }],
  },
  {
    name: "unstake",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ name: "success", type: "bool" }],
  },
];

// Known Hub token addresses (centralized deployment addresses)
export const HUB_TOKENS: Record<string, Address> = {
  USDC: CONTRACTS.polkadotTestnet.demoUSDC,
  USDT: CONTRACTS.polkadotTestnet.demoUSDT,
  DOMAIN: CONTRACTS.polkadotTestnet.demoDOMAIN,
  TCC: CONTRACTS.polkadotTestnet.demoTCC,
  TCX: CONTRACTS.polkadotTestnet.demoTCX,
  TCH: CONTRACTS.polkadotTestnet.demoTCH,
  PAI: CONTRACTS.polkadotTestnet.demoPAI,
  HLT: CONTRACTS.polkadotTestnet.demoHLT,
  RWA: CONTRACTS.polkadotTestnet.demoRWA,
  YIELD: CONTRACTS.polkadotTestnet.demoYIELD,
  INFRA: CONTRACTS.polkadotTestnet.demoINFRA,
  CARB: CONTRACTS.polkadotTestnet.demoCARB,
};
export const BASE_TOKENS: Record<string, Address> = {
  USDC: CONTRACTS.baseSepolia.demoUSDC,
  USDT: CONTRACTS.baseSepolia.demoUSDT,
};

// App contract addresses (centralized)
export const HUB_DEX_ROUTER: Address = CONTRACTS.polkadotTestnet.defaiSimpleSwap;
export const HUB_STAKING_VAULT_USDC: Address = CONTRACTS.polkadotTestnet.defaiStakingVaultUSDC;
export const HUB_STAKING_VAULT_USDT: Address = CONTRACTS.polkadotTestnet.defaiStakingVaultUSDT;
export const HUB_STAKING_VAULTS: Record<string, Address> = {
  USDC: HUB_STAKING_VAULT_USDC,
  USDT: HUB_STAKING_VAULT_USDT,
};
// Backward compatibility for older consumers.
export const HUB_STAKING_VAULT: Address = HUB_STAKING_VAULT_USDC;
export const HUB_PLATFORM: Address = CONTRACTS.polkadotTestnet.defaiPlatform;
export const HUB_ACCESS_PASS_NFT: Address = CONTRACTS.polkadotTestnet.defaiAccessPassNFT;
export const HUB_TOKEN_FACTORY: Address = CONTRACTS.polkadotTestnet.defaiTokenFactory;

// Bridge gateway addresses
export const HUB_BRIDGE_GATEWAY: Address = CONTRACTS.polkadotTestnet.defaiBridgeGateway;
export const BASE_BRIDGE_GATEWAY: Address = CONTRACTS.baseSepolia.defaiBridgeGateway;
export const BASE_SEPOLIA_CHAIN_ID = BASE_SEPOLIA_CHAIN_ID_VALUE;

// DeFAI bridge gateway ABI (execution subset)
export const DEFAI_BRIDGE_GATEWAY_ABI: Abi = [
  {
    name: "bridgeNative",
    type: "function",
    stateMutability: "payable",
    inputs: [
      { name: "destinationChainId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "userNonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "secretHash", type: "bytes32" },
    ],
    outputs: [{ name: "messageId", type: "bytes32" }],
  },
  {
    name: "bridgeERC20",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "destinationChainId", type: "uint256" },
      { name: "recipient", type: "address" },
      { name: "userNonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
      { name: "secretHash", type: "bytes32" },
    ],
    outputs: [{ name: "messageId", type: "bytes32" }],
  },
];

export const DEFAI_ACCESS_PASS_NFT_ABI: Abi = [
  {
    name: "mint",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [{ name: "uri", type: "string" }],
    outputs: [{ name: "tokenId", type: "uint256" }],
  },
  {
    name: "balanceOf",
    type: "function",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    name: "name",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
  {
    name: "symbol",
    type: "function",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "string" }],
  },
];

export const DEFAI_TOKEN_FACTORY_ABI: Abi = [
  {
    name: "createToken",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "symbol", type: "string" },
          { name: "initialSupply", type: "uint256" },
          { name: "owner", type: "address" },
          { name: "initialRecipient", type: "address" },
          { name: "burnEnabled", type: "bool" },
          { name: "transferTaxBps", type: "uint16" },
          { name: "taxRecipient", type: "address" },
          { name: "taxBurnBps", type: "uint16" },
        ],
      },
    ],
    outputs: [{ name: "token", type: "address" }],
  },
];
