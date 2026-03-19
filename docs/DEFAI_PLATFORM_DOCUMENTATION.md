# DeFAI Pal Platform Documentation

## 1) What is DeFAI Pal?

DeFAI Pal is a chat-first DeFi assistant for Polkadot Hub that converts natural language into guided, on-chain actions. Instead of switching between multiple dApps and wallets, users can ask in plain English, review a structured draft, confirm, and execute.

Core user flow:
- User types a command in chat
- AI prepares a transaction draft with warnings/estimates
- User confirms intent (Yes/No)
- User signs in wallet and executes
- Status updates and tx outcomes are posted back in chat

## 2) AI implementation (real model, not a stub)

The primary command path uses a hosted large language model; it is not simulated with fixed keywords only.

- Runtime: Supabase Edge Function `defai-agent` (source in `supabase/functions/defai-agent/index.ts`).
- Provider: Groq, OpenAI-compatible Chat Completions API.
- Model configured in code: `llama-3.3-70b-versatile`.
- Inputs: user `command`, recent chat `history`, and optional `walletContext` (e.g. balances, chain id) so the model can reduce ambiguity.
- Output: JSON with `intent`, `params`, `summary`, `message`, `gasEstimate`, and optional `warnings`. The web app consumes that JSON to show confirmations, educational replies, or executable drafts.
- Secret: `GROQ_API_KEY` must be set in the Supabase project as an Edge Function secret. It never belongs in `VITE_` env vars exposed to the browser.
- Exceptions that skip the model: very short small-talk and simple balance or portfolio phrasing can be handled locally for responsiveness.
- Resilience: if the edge function errors or rate-limits, the client may fall back to a small offline intent parser; the UI states when that fallback is in use.

## 3) Vision and Mission

Vision:
- Make DeFi interaction as intuitive as chatting with a trusted operator.

Mission:
- Reduce DeFi UX friction with AI-guided workflows
- Bring safer, policy-aware execution to everyday users
- Onboard non-technical users to Polkadot Hub DeFi

## 4) Problem Statement

Most DeFi users struggle with:
- Fragmented UX across wallets, bridges, DEXs, and explorers
- Protocol jargon and parameter overload
- Ambiguous token symbols and contract addresses
- Limited in-app guidance during transaction execution

DeFAI Pal solves this by combining conversation, policy controls, and execution tracking in one interface.

## 5) Who It Serves

- New DeFi users learning crypto and execution flow
- Busy users who want faster command-based interaction
- Hackathon/demo audiences needing end-to-end clarity
- Teams evaluating AI-native transaction UX on Polkadot Hub

## 6) Platform Capabilities

- Conversational intents:
  - swap, bridge, stake, unstake, lend, unlend, claim, mint
  - points, research, and general chat/Q&A
- Multi-chat history with local persistence and context carry-over
- On-chain transaction execution with step-by-step chat feedback
- Portfolio dashboard with live balances and NFT holdings
- Token symbol resolution (including ticker-style input like `$TCC`)
- Ambiguity confirmation flow for same-name assets (e.g., TCC/TCX/TCH)

## 7) Security and Trust Model

- OpenZeppelin-based contracts and role controls for policy enforcement
- Allowlisted target/selector model in platform contract
- Fee routing and accounting on execution rails
- Demo bridge design is custodial/relayer-based for speed of prototyping
- Users still confirm and sign transactions in their wallet

## 8) Fees and Points

- Platform fee:
  - 0.1% on executable transaction drafts
- Points:
  - 100 points per executed transaction
- Purpose:
  - Reward engagement and build measurable user progression

## 9) How to Use

1. Connect wallet
2. Type an action (example: `swap 50 usdc to usdt`)
3. Review AI draft and warnings
4. Confirm in chat
5. Sign & execute
6. Track execution updates and tx link in chat/history
7. Review balances in portfolio

## 10) Product Positioning

DeFAI Pal is not a token launcher with chat as a gimmick. It is an AI transaction interface with:
- structured intent extraction
- policy-aware execution paths
- safety messaging and execution transparency

## 11) Current Scope and Roadmap

Current:
- Testnet-first execution and demo assets
- Practical AI command routing
- Chat-based confirmation and status loops

Next:
- richer educational tutor mode
- stronger disambiguation and token metadata registry
- deeper lending analytics
- optional light/dark theme personalization

## 12) Social and Community

Official social handles are not finalized in this repository yet.

Recommended launch placeholders:
- X (Twitter): `@defaipal`
- Telegram: `t.me/defaipal`
- Discord: `discord.gg/defaipal`
- Website: `defaipal.xyz`

Note:
- Replace placeholders with verified channels before public launch.
