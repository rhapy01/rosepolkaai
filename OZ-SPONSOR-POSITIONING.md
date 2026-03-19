# OpenZeppelin Sponsor Track Positioning

## Submission narrative

DeFAI Pal targets **Track 1 (EVM Smart Contract)** on Polkadot Hub with a production-style policy contract, not a token-only deployment.

`DeFAIPlatform` composes OpenZeppelin primitives into a DeFi execution control layer:

- `Ownable2Step` + `AccessControl` for secure administration
- `Pausable` + `ReentrancyGuard` for emergency and runtime safety
- `SafeERC20` for robust token handling
- `IERC20Permit` for optional permit-based UX

For testnet usability, the project also includes `DeFAIBridgeGateway`, a demo bridge gateway for Passet Hub <> Base Sepolia style flows using lock + relayer finalize mechanics.

## Non-trivial contract logic

1. **Policy enforcement**
   - Allowlisted target contracts only
   - Allowlisted function selectors per target
   - Rejects unapproved target or method even if calldata is otherwise valid

2. **Fee routing + accounting**
   - Basis-point fee charged at execution
   - Fee sent directly to treasury
   - Global and per-token fee accounting for analytics and transparency

3. **Secure execution wrapper**
   - Pulls input token from user
   - Approves only net amount to allowlisted target
   - Executes target call and checks minimum output
   - Transfers output to recipient

4. **Permit flow**
   - Optional `permit` before `transferFrom`
   - Supports one-transaction approve+execute UX

5. **Cross-testnet bridge gateway (demo-focused)**
   - Users lock native/ERC20 on source chain
   - Relayers finalize release on destination chain
   - Replay protection via consumed message IDs
   - Role-gated relayer/operator controls

## Why this aligns with sponsor criteria

- Uses OpenZeppelin as core building blocks
- Demonstrates meaningful application composition beyond workshop-level token deployment
- Includes explicit security controls and admin boundaries
- Ready for deployment on Polkadot Hub testnet via Hardhat

## Demo checklist

- Show admin configuring target + selector allowlists
- Execute a policy-routed trade with fee sent to treasury
- Execute permit-based flow without pre-approve transaction
- Show pause/unpause behavior blocking execution
- Show bridge request event and relayer finalization flow
