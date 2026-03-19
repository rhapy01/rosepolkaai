# Rose PolkaAi

Rose PolkaAi is a chat-first DeFi experience for Polkadot Hub (EVM). Connect a wallet, describe what you want in plain language, review the suggested action, and complete it on-chain when you are ready.

## Overview

The app brings common DeFi activities into one conversational flow: swapping, staking, liquidity, bridging demos, a simple NFT mint, and a portfolio view of balances and recent activity. Natural-language handling is done by a real large language model behind a Supabase Edge Function; the UI keeps steps clear before anything is sent to the chain.

## How AI is used (not a mock)

Rose PolkaAi is not a fake-AI demo. When you type a DeFi-related message, the web app calls the Supabase Edge Function named `defai-agent` (`supabase/functions/defai-agent/index.ts`). That function sends your text (plus recent chat history and optional wallet context such as symbols and balances) to Groq’s hosted API using the OpenAI-compatible chat completions endpoint. The model in code is `llama-3.3-70b-versatile`. The model must reply with strict JSON describing an intent (swap, stake, chat, and so on), parameters, summaries, and optional warnings. The app then maps that structure to confirmations and on-chain actions, or shows a plain-language answer for chat-style intents.

A few messages never hit the model on purpose: very short greetings and simple balance or portfolio phrasing can be answered locally for speed. If the edge function is unreachable, returns an error, or you hit rate limits, the client falls back to a small offline pattern matcher so the UI still does something useful; that path is explicitly labeled in chat as offline parsing, not the full AI.

To run AI in your own deployment you must set the secret `GROQ_API_KEY` for the `defai-agent` function in the Supabase project (Dashboard: Project Settings → Edge Functions → Secrets, or `supabase secrets set GROQ_API_KEY=...`). The key stays on the server; it is not a `VITE_` variable in the browser.

## What is in this repository

- Chat interface with per-wallet message history (stored locally in the browser)
- Supabase Edge Functions for AI-assisted commands and optional auth/history patterns
- On-chain actions wired for the configured network (swap, stake, unstake, and related flows depend on deployed contracts and env addresses)
- Portfolio area: on-chain balances for native and ERC-20 tokens, plus activity derived from saved transactions
- Hardhat project: Solidity contracts and scripts for Passet Hub / Polkadot Hub testnet deployments

## Documentation in docs/

Product and submission-oriented material lives under `docs/`, including platform notes, pitch outline, roadmap, security direction, and hackathon checklists. Start with `docs/DEFAI_PLATFORM_DOCUMENTATION.md` if you need the full narrative.

## Polkadot Hub testnet (Passet Hub)

Configured target for demos:

- Chain ID: `420420422`
- RPC: `https://testnet-passet-hub-eth-rpc.polkadot.io`
- Explorer: `https://blockscout-passet-hub.parity-testnet.parity.io`

Add the network in your wallet (Chainlist search: Passet). Test tokens: Polkadot faucet, select Passet Hub on Paseo. More links and context: `POLKADOT-HUB.md`.

## Local development

### Install dependencies

```bash
npm install
```

### Environment variables

Create a `.env` file in the project root. At minimum for the app to call Supabase (including the AI edge function):

```bash
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_KEY=your_anon_key
```

Separately, deploy the `defai-agent` function and configure `GROQ_API_KEY` in Supabase as described in the AI section above. Without that secret, the function will error and the app will use the offline fallback when possible.

Swap execution on-chain requires a configured router and token addresses, for example:

```bash
VITE_DEX_ROUTER=0x...
VITE_TOKEN_WDOT=0x...
VITE_TOKEN_USDC=0x...
VITE_TOKEN_USDT=0x...
```

If `VITE_DEX_ROUTER` is missing, swap execution is disabled; portfolio reads can still show native DOT and ERC-20 balances when token addresses are correct.

### Run the web app

```bash
npm run dev
```

Default dev URL: `http://localhost:8080` (confirm in the Vite terminal output if it differs).

### Scripts (selected)

- `npm run build` — production build
- `npm run lint` — ESLint
- `npm run test` — Vitest
- `npm run compile` — Hardhat compile
- `npm run contracts:test` — Hardhat tests
- `npm run contracts:deploy` — deploy main platform script to Passet Hub (requires funded key)
- See `package.json` for bridge, AMM, staking vault, and other deploy scripts

## Smart contracts

OpenZeppelin-based contracts live under `contracts/`, including `DeFAIPlatform.sol` (policy-style execution layer with roles, pause, and fee routing) and `DeFAIBridgeGateway.sol` for cross-testnet demo bridging with a relayer. This is intended for hackathon and testnet demos, not as a production trust-minimized bridge without further review.

### Compile

```bash
npm run compile
```

### Tests

```bash
npm run contracts:test
```

### Deploy (Passet Hub)

1. Fund the deployer from the faucet.
2. Set the deployer private key for Hardhat: `npx hardhat vars set PRIVATE_KEY`
3. Run: `npm run contracts:deploy` (or the matching `hardhat run` command from `package.json`)

### Verify on Blockscout

Constructor for `DeFAIPlatform` is `(initialOwner, initialTreasury, platformFeeBps)`. Example:

```bash
npx hardhat verify --config hardhat.config.cjs --network passetHub DEPLOYED_ADDRESS "OWNER" "TREASURY" "10"
```

## MVP notes and limitations

- Balances come from the chain; live market prices are not wired into the UI in this MVP.
- Swap and other flows need correct router and token addresses for your deployment.
- Some dashboard sections may be placeholders until additional protocol ABIs or an indexer are connected.

## License and contributions

See repository root for `LICENSE` if present. For submissions, align any demo evidence with `docs/DEMO_EVIDENCE_TEMPLATE.md` and your program checklist.
