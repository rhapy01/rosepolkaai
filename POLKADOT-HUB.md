# Polkadot Hub (EVM/PVM) – DeFAI Smart Contracts

This project targets **Polkadot Hub** for smart contract development and the DeFAI dApp frontend, following the [Polkadot Hackathon Guide](https://github.com/polkadot-developers/hackathon-guide/blob/master/polkadot-hub-devs.md).

## Quick links

| Resource | URL |
|----------|-----|
| **Hackathon guide** | [polkadot-hub-devs.md](https://github.com/polkadot-developers/hackathon-guide/blob/master/polkadot-hub-devs.md) |
| **Polkadot docs** | [docs.polkadot.com](https://docs.polkadot.com/) |
| **Connect wallet (Chainlist)** | [chainlist.org/?search=passet](https://chainlist.org/?search=passet) |
| **Testnet faucet** | [faucet.polkadot.io](https://faucet.polkadot.io/?parachain=1111) – select **Passet Hub** on Paseo |
| **Known issues** | [Google Doc](https://docs.google.com/document/d/1j5hnQZRqlbVagW28dC24OVAF8uRih5jWubBxy5PlMYc/edit?usp=sharing) |
| **Contracts bug tracker** | [contract-issues](https://github.com/paritytech/contract-issues) |

## Passet Hub testnet (frontend + Hardhat)

The app and Hardhat are configured for **Passet Hub**:

- **Network name:** Passet Hub  
- **Chain ID:** `420420422`  
- **RPC URL:** `https://testnet-passet-hub-eth-rpc.polkadot.io`  
- **Block explorer:** [blockscout-passet-hub.parity-testnet.parity.io](https://blockscout-passet-hub.parity-testnet.parity.io/)

Add the network to MetaMask/Talisman via [Chainlist](https://chainlist.org/?search=passet), then get testnet DOT from the [faucet](https://faucet.polkadot.io/?parachain=1111).

## Smart contract stack

- **Runtime:** Polkadot uses **pallet-revive** for EVM-compatible contracts (familiar Ethereum tooling).
- **Dev environment:** [Hardhat](https://docs.polkadot.com/develop/smart-contracts/dev-environments/hardhat/) (recommended).
- **Libraries (frontend):** viem, wagmi, RainbowKit – see [Wagmi on Polkadot](https://docs.polkadot.com/develop/smart-contracts/libraries/wagmi/).

## Commands (Hardhat)

From the repo root:

```bash
# Compile contracts
npm run compile

# Deploy to Passet Hub (set PRIVATE_KEY first)
npx hardhat vars set PRIVATE_KEY
npm run contracts:deploy
npm run contracts:deploy:bridge

# Verify on Blockscout (after deploy)
npx hardhat verify --config hardhat.config.cjs --network passetHub DEPLOYED_CONTRACT_ADDRESS "OWNER_ADDRESS" "TREASURY_ADDRESS" "10"
```

## Contract layout (OpenZeppelin track)

- **`contracts/DeFAIPlatform.sol`** – OpenZeppelin-based platform contract using:
  - `Ownable2Step`, `AccessControl`, `Pausable`, `ReentrancyGuard`, `SafeERC20`, `IERC20Permit`
  - Policy-controlled execution with target + selector allowlisting
  - Fee routing to treasury and per-token fee accounting
  - Optional permit-based execution path
  - Pause/unpause safety controls for admins
- **`scripts/deploy.js`** – Deploys `DeFAIPlatform` with deployer as owner/treasury and 10 bps (0.1%) fee.
- **`contracts/DeFAIBridgeGateway.sol`** – Demo bridge gateway with lock/finalize flow, relayer role, replay protection, and token support allowlist.
- **`scripts/deploy-bridge.js`** – Deploys bridge gateway with deployer as admin/treasury.

## EVM vs PVM

- **EVM:** Standard Hardhat + Solidity; RPC and chain config above. This repo uses the EVM path.
- **PVM:** For Solidity compiled to PVM bytecode, use [@parity/hardhat-polkadot](https://docs.polkadot.com/develop/smart-contracts/dev-environments/hardhat/) (PVM section) and a separate Hardhat project if needed.

## AI / LLM helpers

- For coding assistants: [kitdot AGENTS.md](https://github.com/w3b3d3v/kitdot/blob/main/templates/llms/AGENTS.md) and [Kusama Hub LLMCONTRACTS.md](https://www.kusamahub.com/downloads/LLMCONTRACTS.md) are useful for testnet deployment and config. Prefer [official Polkadot docs](https://docs.polkadot.com/) for up-to-date details.

## Frontend config

- **Chain:** `src/lib/wagmi-config.ts` – `polkadotHub` is Passet Hub (420420422).
- **ABIs / addresses:** `src/lib/contracts.ts` – ERC20, Uniswap V2 router, staking precompile; update token and router addresses for Passet Hub when you have them.
- **Execution:** `src/hooks/useContractExecution.ts` – swap, stake, unstake; extend for new intents and contracts.
