import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `You are the DeFAI Pal platform agent for a chat-first DeFi application on Polkadot Hub testnet.

Your role:
1) Parse executable commands into structured drafts.
2) Provide high-quality educational and product documentation answers in chat mode.
3) Speak as a product expert, teacher, and execution assistant.

AUTHORITATIVE PLATFORM KNOWLEDGE:
- Product: DeFAI Pal (conversational DeFi interface)
- Core value: users type intent in natural language, review a draft, confirm, sign, and execute on-chain
- Main flows: swap, bridge, stake, unstake, lend, unlend, mint NFT, claim demo tokens, points
- Platform fee: 0.1% on executable transactions
- Incentive: 100 points per executed transaction
- Positioning: AI transaction assistant with policy-aware execution UX, not a token-only app
- Chain context: Polkadot Hub testnet (EVM-compatible), MetaMask-compatible
- Bridge note: demo bridge can be relayer-based and should be described with clear trust assumptions
- Safety posture: user always confirms and signs in wallet; include risk reminders where relevant

PLATFORM STORY ELEMENTS (use for docs/pitch/explainer prompts):
- Vision: make DeFi as intuitive as chat
- Mission: reduce DeFi friction and improve execution clarity
- Problem: fragmented UX, jargon overload, and execution confusion
- What it solves: combines intent understanding, confirmation, and transparent execution updates in one UI
- How to use: connect wallet -> type request -> review draft -> confirm -> sign/execute -> monitor outcome
- Fees/points: 0.1% platform fee and 100 points per executed transaction
- Socials: if official handles are not explicitly provided by user/app state, clearly say they are not published yet and offer placeholders

SUPPORTED INTENTS:
1. swap
2. bridge
3. stake
4. unstake
5. lend
6. unlend
7. mint
8. launchpad
9. points
10. chat
11. research
12. claim

INTENT GUIDELINES:
- For executable intents, produce concise transaction-ready drafts.
- For platform documentation, introductions, pitch-deck style requests, deep dives, crypto/blockchain/finance teaching, and general Q&A, set intent="chat".
- If the user asks for "docs", "documentation", "pitch", "deep dive", "vision", "mission", "problem statement", "how it works", "fees", "social handles", or educational explainers, prioritize intent="chat".

CHAT QUALITY BAR (very important):
- Message should be detailed, practical, and easy to understand.
- Prefer a clear structure inside the message:
  1) Direct answer
  2) Why it matters
  3) How it applies to DeFAI Pal
  4) Risks/best practices
  5) Next step
- For teaching prompts, include concrete examples and plain-language definitions.
- Do not output shallow one-liners for educational requests.
- Auto-adjust depth from user wording:
  - short mode: concise, direct, minimal detail
  - standard mode: balanced explanation
  - deep mode: comprehensive explanation with examples and risk framing

EXECUTION NOTES:
- Always keep transaction details realistic for testnet.
- Always include gasEstimate.
- Mention 0.1% fee and 100 points in executable-flow messaging.
- If request is ambiguous, include warnings and safe defaults.
- For launchpad requests, capture: tokenName, tokenSymbol, totalSupply, burnEnabled, tradingTaxBps, taxRecipient, taxBurnBps, owner.

Return strict JSON only (no markdown wrappers around JSON).

JSON schema:
{
  "intent": "swap|bridge|lend|unlend|stake|unstake|mint|launchpad|points|chat|research|claim",
  "summary": "string",
  "params": { "key": "value pairs as strings" },
  "gasEstimate": "string",
  "message": "string",
  "warnings": ["optional warning strings"]
}`;

const INTENTS = ["swap", "bridge", "lend", "unlend", "stake", "unstake", "mint", "launchpad", "points", "chat", "research", "claim"] as const;

type Intent = typeof INTENTS[number];
type ResponseMode = "short" | "standard" | "deep";

type TransactionDraft = {
  intent: Intent;
  summary: string;
  params: Record<string, string>;
  gasEstimate: string;
  message: string;
  warnings?: string[];
};

function detectResponseMode(command: string): ResponseMode {
  const text = command.toLowerCase();
  const shortHints = [
    "quick answer",
    "short answer",
    "brief",
    "in short",
    "tldr",
    "tl;dr",
    "one line",
    "one-liner",
    "summarize quickly",
  ];
  const deepHints = [
    "teach me deeply",
    "deep dive",
    "in detail",
    "detailed",
    "full explanation",
    "step by step",
    "comprehensive",
    "thorough",
    "advanced explanation",
  ];

  if (shortHints.some((hint) => text.includes(hint))) return "short";
  if (deepHints.some((hint) => text.includes(hint))) return "deep";
  return "standard";
}

function toShortMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const compact = trimmed.replace(/\s+/g, " ");
  const sentenceChunks = compact.match(/[^.!?]+[.!?]?/g) ?? [compact];
  const short = sentenceChunks.slice(0, 2).join(" ").trim();
  if (short.length <= 280) return short;
  return `${short.slice(0, 277)}...`;
}

function toDeepMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed) return trimmed;
  const hasStructuredSections = /(why it matters|risks|best practices|next step|how it applies)/i.test(trimmed);
  if (hasStructuredSections) return trimmed;
  return (
    `${trimmed}\n\n` +
    "Why it matters: this helps users move from theory to safer execution decisions.\n\n" +
    "How it applies in DeFAI Pal: you can ask naturally, review the draft, confirm in chat, and execute with wallet signature.\n\n" +
    "Risks and best practices: validate token, chain, amount, and slippage/bridge assumptions before signing.\n\n" +
    "Next step: ask for a practical walkthrough (beginner, intermediate, or advanced) and I will tailor it."
  );
}

const SWAP_ALLOWED_TOKENS = new Set([
  "USDC",
  "USDT",
  "DOMAIN",
  "TCC",
  "TCX",
  "TCH",
  "PAI",
  "HLT",
  "RWA",
  "YIELD",
  "INFRA",
  "CARB",
]);
const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

function normalizeSymbol(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const normalized = raw.trim().replace(/^\$+/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  return normalized || fallback;
}

function extractSwapSymbolsFromCommand(command: string): string[] {
  const upper = command.toUpperCase();
  const symbols = Array.from(SWAP_ALLOWED_TOKENS);
  const found: string[] = [];

  // First pass: explicit ticker mentions like $TCC
  for (const m of upper.matchAll(/\$([A-Z0-9]{2,12})/g)) {
    const symbol = m[1];
    if (SWAP_ALLOWED_TOKENS.has(symbol) && !found.includes(symbol)) found.push(symbol);
  }

  // Second pass: plain symbol words (USDT, TCC, DOMAIN, ...)
  for (const symbol of symbols) {
    const re = new RegExp(`\\b${symbol}\\b`, "i");
    if (re.test(upper) && !found.includes(symbol)) found.push(symbol);
  }

  return found;
}

function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}

function normalizeDraft(raw: unknown, command = ""): TransactionDraft {
  const lowerCommand = command.toLowerCase();
  const isSmallTalk = /^(thanks|thank you|thx|ok|okay|cool|great|nice|got it|hello|hi|hey|bye)\b/i.test(command.trim());
  const launchTokenRequested =
    /\b(create|deploy|launch)\b[\w\s]{0,20}\btoken\b/i.test(command) ||
    /\btoken\s*(name|ticker|symbol)\b/i.test(command) ||
    /\btotal\s+supply\b/i.test(lowerCommand);
  const responseMode = detectResponseMode(command);
  const fallback: TransactionDraft = {
    intent: "research",
    summary: "Unable to confidently parse command. Suggesting research mode.",
    params: { responseMode },
    gasEstimate: "~0.0008 DOT",
    message: "I could not fully parse that command. Try: 'Swap 25 USDC to USDT'. Platform fee is 0.1% and you earn 100 points per executed transaction.",
    warnings: ["Command was ambiguous; generated a safe fallback draft."],
  };

  if (!raw || typeof raw !== "object") return fallback;
  const candidate = raw as Record<string, unknown>;
  const intent = typeof candidate.intent === "string" && INTENTS.includes(candidate.intent as Intent)
    ? (candidate.intent as Intent)
    : fallback.intent;

  const paramsRaw = candidate.params;
  const normalizedParams: Record<string, string> = {};
  if (paramsRaw && typeof paramsRaw === "object") {
    for (const [k, v] of Object.entries(paramsRaw as Record<string, unknown>)) {
      if (v === null || v === undefined) continue;
      normalizedParams[k] = typeof v === "string" ? v : String(v);
    }
  }

  const warnings = Array.isArray(candidate.warnings)
    ? candidate.warnings.filter((w): w is string => typeof w === "string")
    : undefined;

  const draft: TransactionDraft = {
    intent,
    summary: typeof candidate.summary === "string" ? candidate.summary : fallback.summary,
    params: normalizedParams,
    gasEstimate: typeof candidate.gasEstimate === "string" ? candidate.gasEstimate : fallback.gasEstimate,
    message: typeof candidate.message === "string" ? candidate.message : fallback.message,
    warnings,
  };
  draft.params.responseMode = responseMode;

  if (isSmallTalk) {
    draft.intent = "chat";
    draft.summary = "General chat response";
    draft.params.topic = "general";
    draft.message = "You’re welcome. I can help with swaps, bridges, staking, token launches, and crypto/finance questions.";
    return draft;
  }

  // Force launchpad intent when token creation wording is explicit.
  if (launchTokenRequested && draft.intent !== "launchpad") {
    draft.intent = "launchpad";
    draft.summary = "Launch token request detected from command.";
  }

  // Normalize toward executable defaults for deployed contracts.
  if (draft.intent === "swap") {
    const commandSymbols = extractSwapSymbolsFromCommand(command);
    const requestedToken = normalizeSymbol(draft.params.toToken || draft.params.token, "USDT");
    const fromTokenRaw = normalizeSymbol(draft.params.fromToken, "USDC");
    const toTokenRaw = requestedToken;
    const fromToken = SWAP_ALLOWED_TOKENS.has(fromTokenRaw) ? fromTokenRaw : "USDC";
    const defaultTo = fromToken === "USDC" ? "USDT" : "USDC";
    let toToken = SWAP_ALLOWED_TOKENS.has(toTokenRaw) && toTokenRaw !== fromToken ? toTokenRaw : defaultTo;
    let effectiveFromToken = fromToken;

    // Command token mentions override LLM ambiguities (e.g. "swa[ 20 usdt to $tcc").
    if (commandSymbols.length >= 2) {
      effectiveFromToken = commandSymbols[0];
      toToken = commandSymbols[1] === effectiveFromToken ? defaultTo : commandSymbols[1];
    } else if (commandSymbols.length === 1) {
      if (effectiveFromToken === commandSymbols[0]) {
        toToken = defaultTo;
      } else {
        toToken = commandSymbols[0];
      }
    }

    draft.params.fromToken = effectiveFromToken;
    draft.params.toToken = toToken;
    draft.params.amount = draft.params.amount || "10";
    draft.params.protocol = "DeFAISimpleSwap";

    if ((!SWAP_ALLOWED_TOKENS.has(fromTokenRaw) || !SWAP_ALLOWED_TOKENS.has(toTokenRaw) || fromTokenRaw === toTokenRaw) && commandSymbols.length === 0) {
      draft.warnings = [...(draft.warnings ?? []), "Swap token unsupported or ambiguous. Using supported token defaults."];
    }
  }

  if (draft.intent === "bridge") {
    const allowedBridgeTokens = new Set(["USDC", "USDT", "DOT", "ETH"]);
    const tokenRaw = (draft.params.token || "USDC").toUpperCase();
    draft.params.token = allowedBridgeTokens.has(tokenRaw) ? tokenRaw : "USDC";
    draft.params.amount = draft.params.amount || "10";
    draft.params.fromChain = draft.params.fromChain || "Polkadot Hub Testnet";
    draft.params.toChain = draft.params.toChain || "Base Sepolia";
    draft.params.bridgeProtocol = "DeFAI Instant Relayer Bridge";
    draft.params.estimatedTime = draft.params.estimatedTime || "~10-20s";
    if (!allowedBridgeTokens.has(tokenRaw)) {
      draft.warnings = [...(draft.warnings ?? []), "Bridge demo currently supports USDC, USDT, DOT, and ETH symbols."];
    }
  }

  if (draft.intent === "mint") {
    draft.params.collection = draft.params.collection || "DeFAI Access Pass";
    draft.params.chain = draft.params.chain || "Polkadot Hub Testnet";
    draft.params.uri = draft.params.uri || "ipfs://defai/access-pass/default.json";
  }

  if (draft.intent === "stake" || draft.intent === "unstake") {
    const allowedStakeTokens = new Set(["USDC", "USDT"]);
    const tokenRaw = (draft.params.token || "USDC").toUpperCase();
    draft.params.token = allowedStakeTokens.has(tokenRaw) ? tokenRaw : "USDC";
    draft.params.amount = draft.params.amount || "5";
    draft.params.protocol = "DeFAIStakingVault";
    if (!allowedStakeTokens.has(tokenRaw)) {
      draft.warnings = [...(draft.warnings ?? []), "Staking demo currently supports USDC and USDT."];
    }
  }

  if (draft.intent === "lend" || draft.intent === "unlend") {
    const allowedLendTokens = new Set(["USDC", "USDT"]);
    const tokenRaw = (draft.params.token || "USDC").toUpperCase();
    draft.params.token = allowedLendTokens.has(tokenRaw) ? tokenRaw : "USDC";
    draft.params.amount = draft.params.amount || "10";
    draft.params.protocol = "DeFAI Lending Vault (demo)";
    draft.params.apy = draft.params.apy || "8.5%";
    if (draft.intent === "unlend") {
      draft.params.estimatedCompletion = draft.params.estimatedCompletion || "~1 block";
    }
    if (!allowedLendTokens.has(tokenRaw)) {
      draft.warnings = [...(draft.warnings ?? []), "Lending demo currently supports USDC and USDT."];
    }
  }

  if (draft.intent === "claim") {
    draft.params.token = draft.params.token || "USDC";
    draft.params.amount = draft.params.amount || "200";
    draft.params.protocol = "DeFAI Demo Faucet";
  }

  if (draft.intent === "launchpad") {
    const symbolFromCommand = command.match(/\$([a-zA-Z0-9]{2,10})/)?.[1];
    const taxFromCommand =
      command.match(/(?:buy\s+and\s+sell\s+)?(?:trading\s+)?tax\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i)?.[1] ||
      command.match(/(\d+(?:\.\d+)?)\s*%\s*(?:buy\s+and\s+sell\s+)?(?:trading\s+)?tax/i)?.[1];
    const burnTaxFromCommand = command.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:of\s*)?tax\s*(?:to\s*)?burn/i)?.[1];
    const ownerFromCommand = command.match(/0x[a-fA-F0-9]{40}/)?.[0];
    const allTaxToBurn = /\b(all|100%)\s+tax\s+(goes|go)\s+to\s+burn\b/i.test(command) || /\bburn address\b/i.test(command);
    const burnDisabled = /\b(no burn|without burn|burn off|burn disabled)\b/i.test(command);
    const explicitRecipientFromDraft = (draft.params.taxRecipient || "").trim();
    const hasExplicitWalletRecipient = /^0x[a-fA-F0-9]{40}$/.test(ownerFromCommand || "") || /^0x[a-fA-F0-9]{40}$/.test(explicitRecipientFromDraft);
    const hasExplicitTaxDestination = allTaxToBurn || hasExplicitWalletRecipient;

    const normalizedSymbol = normalizeSymbol(
      symbolFromCommand || draft.params.tokenSymbol || draft.params.symbol,
      "MYT"
    );
    const supplyRaw = (draft.params.totalSupply || "1000000").replace(/[^0-9.]/g, "");
    const taxPercent = taxFromCommand
      ? Number.parseFloat(taxFromCommand)
      : Number.parseFloat((draft.params.tradingTaxBps || "0").replace(/[^0-9.]/g, "")) / 100;
    const burnTaxPercent = burnTaxFromCommand
      ? Number.parseFloat(burnTaxFromCommand)
      : Number.parseFloat((draft.params.taxBurnBps || "0").replace(/[^0-9.]/g, "")) / 100;
    const requestedTaxBps = Number.isFinite(taxPercent) ? Math.max(0, Math.min(1000, Math.round(taxPercent * 100))) : 0;
    const taxBps = hasExplicitTaxDestination ? requestedTaxBps : 0;
    const taxBurnBps = Number.isFinite(burnTaxPercent)
      ? Math.max(0, Math.min(10000, Math.round(burnTaxPercent * 100)))
      : 0;

    draft.params.tokenName = draft.params.tokenName || "My Launch Token";
    draft.params.tokenSymbol = normalizedSymbol;
    draft.params.totalSupply = supplyRaw || "1000000";
    draft.params.burnEnabled = burnDisabled ? "no" : (draft.params.burnEnabled || "yes");
    draft.params.burnMechanism = burnDisabled ? "disabled" : (draft.params.burnMechanism || "enabled");
    draft.params.tradingTaxBps = String(taxBps);
    draft.params.taxBurnBps = String(taxBps === 0 ? 0 : (allTaxToBurn ? 10000 : taxBurnBps));
    draft.params.taxRecipient = taxBps === 0
      ? ""
      : allTaxToBurn
        ? BURN_ADDRESS
        : (ownerFromCommand || draft.params.taxRecipient || "");
    draft.params.owner = ownerFromCommand || draft.params.owner || "connected-wallet";
    draft.params.protocol = "DeFAITokenFactory";
    draft.params.platform = draft.params.platform || "DeFAI Launchpad";
    draft.params.standard = draft.params.standard || "ERC20";
    draft.gasEstimate = draft.gasEstimate || "~0.003 DOT";
    if (requestedTaxBps > 0 && !hasExplicitTaxDestination) {
      draft.warnings = [...(draft.warnings ?? []), "Tax percentage was provided without a destination (burn or wallet). Tax has been set to 0."];
    }
  }

  if (draft.intent === "chat") {
    draft.params.topic = draft.params.topic || "general";
    if (!draft.message || draft.message.trim().length === 0) {
      draft.message =
        "DeFAI Pal is a chat-first DeFi platform on Polkadot Hub that lets you type natural-language intents, review a draft, and execute on-chain with wallet confirmation.\n\n" +
        "Why this matters: most users get blocked by fragmented tools, token ambiguity, and execution complexity. DeFAI Pal reduces that friction with guided confirmations and in-chat transaction feedback.\n\n" +
        "How to use it: connect wallet, type your request, review details (including fee and warnings), confirm, then sign and execute.\n\n" +
        "Risk best practice: verify token/chain/amount before signing and treat bridge/lending actions according to their trust and protocol risks.\n\n" +
        "If you want, I can generate a full platform brief, pitch-deck outline, deep dive, or beginner-to-advanced crypto lesson.";
    }
    if (responseMode === "short") draft.message = toShortMessage(draft.message);
    if (responseMode === "deep") draft.message = toDeepMessage(draft.message);
  }

  if (draft.intent === "research") {
    if (responseMode === "short") draft.message = toShortMessage(draft.message);
    if (responseMode === "deep") draft.message = toDeepMessage(draft.message);
  }

  return draft;
}

type ChatHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

async function callGroq(command: string, history: ChatHistoryItem[] = []): Promise<TransactionDraft> {
  const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
  if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY is not configured");
  const responseMode = detectResponseMode(command);

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GROQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      temperature: 0.1,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "system",
          content:
            `Response depth requested: ${responseMode}. ` +
            "For chat/research answers, match this depth: short=concise, standard=balanced, deep=comprehensive teaching with examples and risk notes.",
        },
        ...history
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-12)
          .map((m) => ({ role: m.role, content: m.content })),
        { role: "user", content: command },
      ],
    }),
  });

  if (!response.ok) {
    if (response.status === 429) {
      throw new Error("Rate limited. Please try again in a moment.");
    }
    if (response.status === 401 || response.status === 403) {
      throw new Error("Invalid or missing Groq credentials.");
    }
    const text = await response.text();
    console.error("Groq error:", response.status, text);
    throw new Error("AI processing failed");
  }

  const data = await response.json();
  const rawText = data?.choices?.[0]?.message?.content;
  if (!rawText || typeof rawText !== "string") {
    throw new Error("Failed to parse command");
  }

  const jsonText = extractJsonObject(rawText);
  if (!jsonText) {
    throw new Error("Failed to parse command");
  }

  const parsed = JSON.parse(jsonText);
  return normalizeDraft(parsed, command);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { command, history } = await req.json();
    
    if (!command || typeof command !== "string") {
      return new Response(JSON.stringify({ error: "Command is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const parsed = await callGroq(command, Array.isArray(history) ? history as ChatHistoryItem[] : []);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("defai-agent error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
