# RosePolkaAi (Polkadot Hub) — Conversational DeFi MVP

RosePolkaAi is a **chat-first DeFi assistant** for **Polkadot Hub** (EVM/PVM). Users connect a wallet, type natural-language commands (swap / stake / etc.), review a structured confirmation, then **sign & execute** on-chain.

## What’s included

- **Chat UI** with message history (persisted in localStorage per wallet)
- **AI → transaction draft** flow via Supabase Edge Function (`defai-agent`)
- **On-chain execution** (currently: swap / stake / unstake; swap requires a configured router)
- **Portfolio dashboard**
  - Real **on-chain balances** (native + ERC20 `balanceOf`)
  - Activity chart from saved transactions
  - Staking/lending positions are placeholders until protocol ABIs/indexer are integrated
- **History + points** (Supabase)
- **Hardhat contracts workspace** + deploy script for Passet Hub

## Platform knowledge docs (for product + agent context)

- `docs/DEFAI_PLATFORM_DOCUMENTATION.md`
- `docs/DEFAI_PITCH_DECK.md`
- `docs/DEFAI_DEEP_DIVE.md`
- `docs/DEFAI_EDUCATION_PLAYBOOK.md`
- `docs/HACKATHON_SUBMISSION_CHECKLIST.md`
- `docs/DEMO_EVIDENCE_TEMPLATE.md`
- `docs/ROADMAP_30_60_90.md`
- `docs/SECURITY_AND_AUDIT_PLAN.md`

## Hackathon winner-criteria alignment

This repo includes judge-friendly artifacts mapped to the expected evaluation criteria:

- **Polkadot on-chain identity**
  - Team identity setup guide reference:
    - [Polkadot OpenGov + identity guide](https://openguild.wtf/blog/polkadot/polkadot-opengov-introduction)
  - Submission checklist field for identity proof:
    - `docs/HACKATHON_SUBMISSION_CHECKLIST.md`
- **Quality documentation**
  - Product docs, pitch, deep dive, and educational playbook under `docs/`
- **UI/UX quality**
  - Chat-first execution flow with confirmation, status updates, and transaction feedback
- **Demonstration readiness**
  - Local setup in this README + evidence template:
    - `docs/DEMO_EVIDENCE_TEMPLATE.md`
- **Vision and commitment**
  - Vision/mission/problem statements documented in `docs/DEFAI_PLATFORM_DOCUMENTATION.md`
  - 30/60/90 execution plan in `docs/ROADMAP_30_60_90.md`
  - Security and audit direction in `docs/SECURITY_AND_AUDIT_PLAN.md`
- **Track relevance**
  - Track 1 (EVM) + OZ Sponsor alignment documented in:
    - `POLKADOT-HUB.md`
    - `OZ-SPONSOR-POSITIONING.md`

## Network (Passet Hub testnet)

This repo is configured for **Passet Hub** (Polkadot Hub testnet):

- **Chain ID**: `420420422`
- **RPC**: `https://testnet-passet-hub-eth-rpc.polkadot.io`
- **Explorer**: `https://blockscout-passet-hub.parity-testnet.parity.io`
- Add it to your wallet via [Chainlist](https://chainlist.org/?search=passet)
- Get testnet tokens from the [Polkadot faucet](https://faucet.polkadot.io/?parachain=1111) (select **Passet Hub** on Paseo)

For more context and links, see `POLKADOT-HUB.md`.

## Setup

### 1) Install

```bash
npm install
```

### 2) Environment variables

Create `.env` in the project root with at least:

```bash
# Supabase (required for AI + history/points)
VITE_SUPABASE_URL=...
VITE_SUPABASE_PUBLISHABLE_KEY=...

# Optional: configure real token/router addresses for swaps on Passet Hub
VITE_DEX_ROUTER=0x...
VITE_TOKEN_WDOT=0x...
VITE_TOKEN_USDC=0x...
VITE_TOKEN_USDT=0x...
```

Notes:
- If `VITE_DEX_ROUTER` is not set, **swap execution is disabled** with a helpful error.
- Portfolio balances still work for native DOT; ERC20 balances require correct token addresses.

### 3) Run the app

```bash
npm run dev
```

Open `http://localhost:8080`.

## Smart contracts (OpenZeppelin-based) — deploy + verify

This repo includes an **OpenZeppelin-based** platform contract at `contracts/DeFAIPlatform.sol` and Hardhat config for Passet Hub.
It also includes a testnet bridge gateway at `contracts/DeFAIBridgeGateway.sol` for cross-testnet demo flows (e.g., Passet Hub <-> Base Sepolia via relayer).

OpenZeppelin primitives used:

- `Ownable2Step` + `Ownable`
- `AccessControl` (roles)
- `Pausable`
- `ReentrancyGuard`
- `SafeERC20`
- `IERC20Permit` (optional permit-based flow)

### Why this is competitive for OZ sponsor track

`DeFAIPlatform` is not a token-only contract. It is a policy-enforcing execution layer that combines OZ primitives into application logic:

- Target **address allowlisting** (`allowedTargets`)
- Per-target **function selector allowlisting** (`allowedTargetSelectors`)
- Protocol-level **fee routing** to treasury on each execution
- Optional **permit + execute** path to reduce UX friction
- Role-gated admin controls with pause and reentrancy protections

### Compile

```bash
npm run compile
```

### Contract tests

```bash
npm run contracts:test
```

### Deploy to Passet Hub

1. Fund your deployer wallet using the faucet.
2. Set your private key in Hardhat (stored locally by Hardhat):

```bash
npx hardhat vars set PRIVATE_KEY
```

3. Deploy:

```bash
npm run contracts:deploy
# or
npx hardhat run --config hardhat.config.cjs scripts/deploy.js --network passetHub
```

Deploy bridge gateway:

```bash
npm run contracts:deploy:bridge
```

### Verify on Blockscout

`DeFAIPlatform` constructor is `(address initialOwner, address initialTreasury, uint256 platformFeeBps)`.

```bash
npx hardhat verify --config hardhat.config.cjs --network passetHub DEPLOYED_ADDRESS "OWNER_ADDRESS" "TREASURY_ADDRESS" "10"
```

### Roles & safety controls

The deployer/owner is granted:

- `DEFAULT_ADMIN_ROLE`
- `TREASURER_ROLE` (can withdraw funds)
- `FEE_RECORDER_ROLE` (can call `recordFee`)

Admin can:

- `pause()` / `unpause()`
- update `treasury`
- update target/selector allowlists

Withdrawals, fee recording, and policy execution are blocked while paused.

### Bridge gateway (demo mode)

`DeFAIBridgeGateway` provides a hackathon-friendly bridge flow:

- Users call `bridgeNative` / `bridgeERC20` on source chain (locks assets + emits `BridgeRequested`)
- Relayer listens for events and calls `finalizeNative` / `finalizeERC20` on destination chain
- Replay protection via `processedMessages[messageId]`
- Role-gated relayer/operator/treasurer controls

Important: this is a **custodial testnet bridge design** for demo velocity, not a trustless production bridge.

## MVP status / known gaps

- **Balances**: real on-chain reads (native + ERC20)
- **Swap execution**: requires **real router + token addresses** on Passet Hub
- **Staking/lending positions**: UI exists, reads not wired yet (needs protocol ABIs or an indexer)
- **Prices**: not connected yet (dashboard shows balances, not USD valuation)

