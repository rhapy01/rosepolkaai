import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAccount, usePublicClient, useSwitchChain } from "wagmi";
import { type Address } from "viem";
import { MessageSquarePlus, House, LayoutDashboard, Clock3, Trophy, User, Shield, Map as MapIcon, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useContractExecution, type ExecutionStep } from "@/hooks/useContractExecution";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { usePortfolioBalances } from "@/hooks/usePortfolioBalances";
import { polkadotHub } from "@/lib/wagmi-config";
import { BASE_SEPOLIA_CHAIN_ID, HUB_TOKENS } from "@/lib/contracts";
import CommandBar from "@/components/CommandBar";
import ChatConversation, { type ChatMessage } from "@/components/ChatConversation";
import ActionCard, { type TransactionDraft } from "@/components/ActionCard";
import TopBar from "@/components/TopBar";
import BottomNav from "@/components/BottomNav";
import WalletButton from "@/components/WalletButton";
import ProfilePanel from "@/components/ProfilePanel";
import HistoryPanel from "@/components/HistoryPanel";
import PointsPanel from "@/components/PointsPanel";
import AdminPanel from "@/components/AdminPanel";
import PortfolioDashboard from "@/components/PortfolioDashboard";
import RoadmapPanel from "@/components/RoadmapPanel";
import AboutPanel from "@/components/AboutPanel";
import { HUB_AMM_POOLS } from "@/lib/amm-pools";
import { DEFAI_STAKING_VAULT_ABI, ERC20_ABI, HUB_STAKING_VAULTS, HUB_STAKEABLE_SYMBOLS } from "@/lib/contracts";

interface ActiveAction {
  id: string;
  draft: TransactionDraft;
}

interface PendingConfirmation {
  id: string;
  draft: TransactionDraft;
  prompt: string;
  options?: string[];
  selectionField?: "toToken" | "token" | "fromToken" | "amount" | "liquidityPair" | "lpAmount";
  customInput?: {
    placeholder?: string;
    submitLabel?: string;
  };
}

interface ConversationThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  actions: ActiveAction[];
  createdAt: number;
  updatedAt: number;
}

interface WalletContextPayload {
  walletAddress?: string;
  chainId?: number;
  balances: { symbol: string; formatted: string }[];
  liquidityPairs: string[];
  historicalLiquidityPairs?: string[];
}

interface WalletContextPayload {
  walletAddress?: string;
  chainId?: number;
  balances: { symbol: string; formatted: string }[];
  liquidityPairs: string[];
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function parseLooseAmount(raw: string | undefined, fallback: string): string {
  if (!raw) return fallback;
  const normalized = raw
    .replace(/[oO](\d)/g, "0$1")
    .replace(/(\d)[oO]/g, "$10")
    .replace(/[^0-9.]/g, "");
  return normalized || fallback;
}

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";
const SEEDED_BASELINE_LP = 10000n * 10n ** 18n;

function draftKey(draft: TransactionDraft) {
  return `${draft.intent}:${draft.params?.protocol ?? ""}:${JSON.stringify(draft.params ?? {})}`;
}

const SIDEBAR_TABS = [
  { id: "home", label: "Home", icon: House },
  { id: "about", label: "About", icon: Info },
  { id: "portfolio", label: "Portfolio", icon: LayoutDashboard },
  { id: "history", label: "History", icon: Clock3 },
  { id: "points", label: "Points", icon: Trophy },
  { id: "roadmap", label: "Roadmap", icon: MapIcon },
  { id: "profile", label: "Profile", icon: User },
  { id: "admin", label: "Admin", icon: Shield },
] as const;

const EXECUTABLE_INTENTS = new Set([
  "swap",
  "addLiquidity",
  "removeLiquidity",
  "bridge",
  "stake",
  "unstake",
  "lend",
  "unlend",
  "claim",
  "mint",
  "launchpad",
]);

export default function Index() {
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient();
  const conversationsStorageKey = useMemo(() => {
    const suffix = address ? address.toLowerCase() : "anon";
    return `defai.conversations.${suffix}`;
  }, [address]);
  const activeConversationStorageKey = useMemo(() => {
    const suffix = address ? address.toLowerCase() : "anon";
    return `defai.conversations.active.${suffix}`;
  }, [address]);

  const [conversations, setConversations] = useState<ConversationThread[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string>("");
  const [actions, setActions] = useState<ActiveAction[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState("home");
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation | null>(null);
  const { switchChainAsync } = useSwitchChain();
  const { state: execState, execute, reset: resetExec } = useContractExecution();
  const lastExecStepRef = useRef<ExecutionStep>("idle");
  const confirmHeartbeatRef = useRef<{ timer: number | null; count: number; startedAt: number; lastHash: string | null }>({
    timer: null,
    count: 0,
    startedAt: 0,
    lastHash: null,
  });

  const { saveTransaction, transactions } = useTransactionHistory(address);
  const { balances, isLoading: balancesLoading, error: balancesError } = usePortfolioBalances(address as any);
  // After await defai-agent, use latest balances — stale closure used to show "no swappable token" while portfolio had data.
  const balancesRef = useRef(balances);
  const balancesLoadingRef = useRef(balancesLoading);
  useEffect(() => {
    balancesRef.current = balances;
  }, [balances]);
  useEffect(() => {
    balancesLoadingRef.current = balancesLoading;
  }, [balancesLoading]);

  // When users click quickly, the AI call can return before balances are finished loading.
  // We wait briefly (without blocking the whole UI) and then recompute token options.
  const waitForBalancesLoaded = useCallback(async (timeoutMs = 4500): Promise<boolean> => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (
        !balancesLoadingRef.current &&
        balancesRef.current.length > 1
      ) {
        return true;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return !balancesLoadingRef.current;
  }, []);

  const visibleConversations = useMemo(
    () =>
      conversations
        .filter((thread) => (thread.messages?.length ?? 0) > 0 || (thread.actions?.length ?? 0) > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  );

  const myLiquidityPairOptions = useMemo(() => {
    const pairs = new Set<string>();
    // Use persisted wallet transaction history to infer pairs user actually touched.
    for (const tx of transactions) {
      if (tx.intent !== "addLiquidity" && tx.intent !== "removeLiquidity") continue;
      const params = (tx.params || {}) as Record<string, unknown>;
      const t0 = String(params.token0 || "").toUpperCase();
      const t1 = String(params.token1 || "").toUpperCase();
      if (!t0 || !t1) continue;
      pairs.add(`${t0}/${t1}`);
    }
    return Array.from(pairs).sort();
  }, [transactions]);
  const [onchainLiquidityPairOptions, setOnchainLiquidityPairOptions] = useState<string[]>([]);

  const readOnchainLiquidityPairs = useCallback(async (): Promise<string[]> => {
    if (!publicClient || !address) return [];
    try {
      const entries = Object.entries(HUB_AMM_POOLS) as [string, Address][];
      const lpReads: { pair: string; lpBalance: bigint }[] = [];
      for (const [pair, pool] of entries) {
        if (!pool || pool.toLowerCase() === "0x0000000000000000000000000000000000000000") continue;
        try {
          const lpBal = (await publicClient.readContract({
            address: pool,
            abi: ERC20_ABI,
            functionName: "balanceOf",
            args: [address],
          } as any)) as bigint;
          if (lpBal > 0n) lpReads.push({ pair: pair.toUpperCase(), lpBalance: lpBal });
        } catch {
          // skip problematic pools
        }
      }
      const minNonZero = lpReads.reduce<bigint | null>((acc, r) => {
        if (acc === null) return r.lpBalance;
        return r.lpBalance < acc ? r.lpBalance : acc;
      }, null);
      const baselineLp = minNonZero !== null && minNonZero > 0n ? minNonZero : SEEDED_BASELINE_LP;

      const pairs = lpReads.filter((r) => r.lpBalance > baselineLp).map((r) => r.pair);
      return Array.from(new Set(pairs)).sort();
    } catch {
      return [];
    }
  }, [publicClient, address]);

  useEffect(() => {
    let cancelled = false;
    async function loadOnchainLiquidityPairs() {
      const pairs = await readOnchainLiquidityPairs();
      if (!cancelled) setOnchainLiquidityPairOptions(pairs);
    }
    loadOnchainLiquidityPairs();
    return () => {
      cancelled = true;
    };
  }, [readOnchainLiquidityPairs]);

  const effectiveLiquidityPairOptions = useMemo(() => {
    if (onchainLiquidityPairOptions.length > 0) return onchainLiquidityPairOptions;
    return myLiquidityPairOptions;
  }, [onchainLiquidityPairOptions, myLiquidityPairOptions]);

  const hasLiquidityKeyword = useCallback((command: string) => {
    return /\b(lp|liquidity|liq[a-z]*)\b/i.test(command.toLowerCase());
  }, []);

  const canonicalTokenSymbol = useCallback((symbol?: string) => {
    const upper = String(symbol || "")
      .trim()
      .replace(/^\$+/, "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .toUpperCase();
    if (!upper) return "";
    if (upper.startsWith("D")) {
      const deprefixed = upper.slice(1);
      if (HUB_TOKENS[deprefixed as keyof typeof HUB_TOKENS]) return deprefixed;
    }
    return upper;
  }, []);

  const addLiquidityPairOptions = useMemo(() => {
    const balanceBySymbol = new Map<string, number>();
    for (const b of balances) {
      const sym = canonicalTokenSymbol(b.symbol);
      const amount = Number(b.formatted);
      if (!sym || !Number.isFinite(amount) || amount <= 0) continue;
      balanceBySymbol.set(sym, amount);
    }
    const ranked = Object.keys(HUB_AMM_POOLS)
      .map((pair) => {
        const [a, b] = pair.toUpperCase().split("/");
        const balA = balanceBySymbol.get(a) ?? 0;
        const balB = balanceBySymbol.get(b) ?? 0;
        return { pair: `${a}/${b}`, score: Math.min(balA, balB) };
      })
      .filter((x) => x.score > 0)
      .sort((x, y) => y.score - x.score)
      .map((x) => x.pair);
    return Array.from(new Set(ranked));
  }, [balances, canonicalTokenSymbol]);

  const commandMentionsAddAmount = useCallback((command: string) => {
    const lower = command.toLowerCase();
    if (/(\d+(?:\.\d+)?)\s*%/i.test(lower)) return true;
    return /(\d[\d.,oO]*)/i.test(lower);
  }, []);

  const commandMentionsAnyAmount = useCallback((command: string) => {
    const lower = command.toLowerCase();
    if (/\b(all|max|half)\b/i.test(lower)) return true;
    if (/(\d+(?:\.\d+)?)\s*%/i.test(lower)) return true;
    return /(\d[\d.,oO]*)/i.test(lower);
  }, []);

  const extractMentionedSymbols = useCallback((command: string) => {
    const lower = command.toLowerCase();
    return [...lower.matchAll(/\$?(usdc|usdt|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/gi)]
      .map((m) => canonicalTokenSymbol(m[1]))
      .filter(Boolean);
  }, [canonicalTokenSymbol]);

  const getBalanceBySymbol = useCallback((symbolRaw?: string) => {
    const symbol = canonicalTokenSymbol(symbolRaw);
    if (!symbol) return 0;
    const bal = balances.find((b) => canonicalTokenSymbol(b.symbol) === symbol);
    const n = Number(bal?.formatted || "0");
    return Number.isFinite(n) ? n : 0;
  }, [balances, canonicalTokenSymbol]);

  const getStakedAmountByToken = useCallback(
    async (tokenSymbolRaw?: string): Promise<number> => {
      const tokenSymbol = canonicalTokenSymbol(tokenSymbolRaw);
      if (!tokenSymbol) return 0;
      const vault = HUB_STAKING_VAULTS[tokenSymbol];
      if (!vault || vault.toLowerCase() === "0x0000000000000000000000000000000000000000") return 0;
      if (!publicClient || !address) return 0;

      // Vault stores userInfo.amount in staking token units (raw), so we need decimals.
      const stakingTokenAddr = (await publicClient.readContract({
        address: vault,
        abi: DEFAI_STAKING_VAULT_ABI,
        functionName: "stakingToken",
      } as any)) as Address;
      const decimals = (await publicClient.readContract({
        address: stakingTokenAddr,
        abi: ERC20_ABI,
        functionName: "decimals",
      } as any)) as number;
      const userInfo = (await publicClient.readContract({
        address: vault,
        abi: DEFAI_STAKING_VAULT_ABI,
        functionName: "userInfo",
        args: [address],
      } as any)) as readonly [bigint, bigint, bigint];

      // amount is staking token amount (raw)
      const amtRaw = userInfo[0];
      // Convert raw to human number
      const amtHuman = Number(amtRaw) / 10 ** decimals;
      return Number.isFinite(amtHuman) ? amtHuman : 0;
    },
    [address, balances, canonicalTokenSymbol, publicClient]
  );

  const tokenOptionsByBalance = useMemo(() => {
    return balances
      .map((b) => ({
        symbol: canonicalTokenSymbol(b.symbol),
        balance: Number(b.formatted),
      }))
      .filter((x) => x.symbol && Number.isFinite(x.balance) && x.balance > 0)
      .sort((a, b) => b.balance - a.balance)
      .map((x) => x.symbol);
  }, [balances, canonicalTokenSymbol]);

  const stakeableSymbolSet = useMemo(
    () => new Set(HUB_STAKEABLE_SYMBOLS.map((s) => s.toUpperCase())),
    []
  );

  const stakeableTokenOptions = useMemo(() => {
    return tokenOptionsByBalance.filter((s) => stakeableSymbolSet.has(s));
  }, [tokenOptionsByBalance, stakeableSymbolSet]);

  const getUnstakeableTokenOptions = useCallback(async (): Promise<string[]> => {
    const vaultTokens = Object.keys(HUB_STAKING_VAULTS).map((k) => canonicalTokenSymbol(k));
    const unique = Array.from(new Set(vaultTokens)).filter(Boolean);
    const out: string[] = [];
    for (const t of unique) {
      const staked = await getStakedAmountByToken(t);
      if (Number.isFinite(staked) && staked > 0) out.push(t);
    }
    return out;
  }, [canonicalTokenSymbol, getStakedAmountByToken]);

  const getSwapCounterpartOptions = useCallback((fromTokenRaw?: string) => {
    const from = canonicalTokenSymbol(fromTokenRaw);
    if (!from) return [] as string[];
    const out = new Set<string>();
    for (const pair of Object.keys(HUB_AMM_POOLS)) {
      const [a, b] = pair.toUpperCase().split("/");
      if (a === from) out.add(b);
      if (b === from) out.add(a);
    }
    return Array.from(out);
  }, [canonicalTokenSymbol]);

  /** Use after async (e.g. AI invoke) so options reflect balances that loaded during the round-trip. */
  const computeSwapFromTokenOptions = useCallback(
    (balanceRows: typeof balances) => {
      const parseNum = (v: unknown) => {
        const s = String(v ?? "");
        return Number(s.replace(/,/g, ""));
      };
      const symbols = balanceRows
        .map((b) => ({
          symbol: canonicalTokenSymbol(b.symbol),
          balance: parseNum(b.formatted),
        }))
        .filter((x) => x.symbol && Number.isFinite(x.balance) && x.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .map((x) => x.symbol);
      return symbols.filter((s) => getSwapCounterpartOptions(s).length > 0);
    },
    [canonicalTokenSymbol, getSwapCounterpartOptions]
  );

  const computeStakeableTokenOptionsFromBalances = useCallback(
    (balanceRows: typeof balances) => {
      const parseNum = (v: unknown) => {
        const s = String(v ?? "");
        return Number(s.replace(/,/g, ""));
      };
      return balanceRows
        .map((b) => ({
          symbol: canonicalTokenSymbol(b.symbol),
          balance: parseNum(b.formatted),
        }))
        .filter((x) => x.symbol && Number.isFinite(x.balance) && x.balance > 0)
        .sort((a, b) => b.balance - a.balance)
        .map((x) => x.symbol)
        .filter((s) => stakeableSymbolSet.has(s));
    },
    [canonicalTokenSymbol, stakeableSymbolSet]
  );

  const getBalanceBySymbolFromRows = useCallback(
    (balanceRows: typeof balances, symbolRaw?: string) => {
      const symbol = canonicalTokenSymbol(symbolRaw);
      if (!symbol) return 0;
      const bal = balanceRows.find((b) => canonicalTokenSymbol(b.symbol) === symbol);
      const n = Number(String(bal?.formatted || "0").replace(/,/g, ""));
      return Number.isFinite(n) ? n : 0;
    },
    [canonicalTokenSymbol]
  );

  const commandMentionsPair = useCallback((command: string) => {
    const lower = command.toLowerCase();
    if (/\b[a-z]{2,10}\s*\/\s*[a-z]{2,10}\b/i.test(lower)) return true;
    const symbols = [...lower.matchAll(/\$?(usdc|usdt|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/gi)];
    return symbols.length >= 2;
  }, []);

  const commandMentionsRemoveAmount = useCallback((command: string) => {
    const lower = command.toLowerCase();
    if (/\b(all|max)\b/i.test(lower)) return true;
    if (/(\d+(?:\.\d+)?)\s*%/i.test(lower)) return true;
    return /(\d[\d.,oO]*)/i.test(lower);
  }, []);

  const pushAssistantMessage = useCallback((content: string) => {
    setMessages((prev) => [...prev, { id: genId(), role: "assistant", content }]);
  }, []);

  const formatBalancesMessage = useCallback(() => {
    if (!address) {
      return "Connect your wallet first, then I can show all your asset balances.";
    }
    if (balancesLoading) {
      return "Fetching your portfolio balances... try again in a moment.";
    }
    if (balancesError) {
      return `I couldn't load balances right now: ${balancesError}`;
    }
    if (balances.length === 0) {
      return "No balances found yet for tracked assets.";
    }
    const lines = balances.map(
      (b) => `- ${Number(b.formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} ${b.symbol}`
    );
    return `Here are your current assets on Polkadot Hub:\n${lines.join("\n")}`;
  }, [address, balancesLoading, balancesError, balances]);

  const toCleanAmount = useCallback((n: number) => {
    const fixed = n.toFixed(6);
    return fixed.replace(/\.?0+$/, "");
  }, []);

  const buildAddLiquidityDraftFromPair = useCallback(
    (token0Raw: string, token1Raw: string, source?: TransactionDraft, percentOfBalance?: number): TransactionDraft => {
      const token0 = canonicalTokenSymbol(token0Raw);
      const token1 = canonicalTokenSymbol(token1Raw);
      const bal0 = Number(balances.find((b) => canonicalTokenSymbol(b.symbol) === token0)?.formatted || "0");
      const bal1 = Number(balances.find((b) => canonicalTokenSymbol(b.symbol) === token1)?.formatted || "0");
      const deriveSuggestedAmount = (balance: number) => {
        if (!Number.isFinite(balance) || balance <= 0) return "";
        const pct = Number.isFinite(percentOfBalance) ? Math.max(0, Math.min(100, Number(percentOfBalance))) : NaN;
        const target = Number.isFinite(pct) ? (balance * pct) / 100 : balance >= 100 ? balance * 0.1 : balance * 0.25;
        const clipped = Math.max(0, Math.min(balance, target));
        const normalized = toCleanAmount(clipped);
        if (Number(normalized) > 0) return normalized;
        return toCleanAmount(balance);
      };
      const amount0 = deriveSuggestedAmount(bal0);
      const amount1 = deriveSuggestedAmount(bal1);
      const warnings = [...(source?.warnings || [])];
      if (!amount0 || !amount1) {
        warnings.push("Could not derive non-zero amounts from current balances. Specify explicit amounts before execution.");
      } else {
        if (Number.isFinite(percentOfBalance)) {
          warnings.push(`Sized at ${Number(percentOfBalance)}% of wallet balances (${token0}: ${amount0}, ${token1}: ${amount1}).`);
        } else {
          warnings.push(`Suggested sizes derived from wallet balances (${token0}: ${amount0}, ${token1}: ${amount1}).`);
        }
      }

      return {
        intent: "addLiquidity",
        summary: amount0 && amount1
          ? `Add liquidity: ${amount0} ${token0} + ${amount1} ${token1}`
          : `Add liquidity into ${token0}/${token1}`,
        params: {
          ...(source?.params || {}),
          token0,
          token1,
          amount0,
          amount1,
          lpAmount: Number.isFinite(percentOfBalance) ? `${Number(percentOfBalance)}%` : (source?.params?.lpAmount || ""),
          protocol: source?.params?.protocol || "DeFAI AMM Pool",
        },
        gasEstimate: source?.gasEstimate || "~0.001 DOT",
        message: source?.message || "Prepared from wallet balance context.",
        warnings: warnings.length ? warnings : undefined,
      };
    },
    [balances, canonicalTokenSymbol, toCleanAmount]
  );

  const walletContext = useMemo<WalletContextPayload>(
    () => ({
      walletAddress: address,
      chainId,
      balances: balances.map((b) => ({ symbol: canonicalTokenSymbol(b.symbol), formatted: String(b.formatted) })),
      liquidityPairs: onchainLiquidityPairOptions,
      historicalLiquidityPairs: myLiquidityPairOptions,
    }),
    [address, chainId, balances, canonicalTokenSymbol, onchainLiquidityPairOptions, myLiquidityPairOptions]
  );

  const buildPendingConfirmation = useCallback(
    (draft: TransactionDraft): PendingConfirmation => {
      const p = draft.params ?? {};
      let prompt = `I understood this action: ${draft.summary}. Proceed?`;
      if (draft.intent === "swap") {
        prompt = `You want to swap ${p.amount || "0"} ${p.fromToken || "USDC"} to ${p.toToken || "USDT"}. Proceed?`;
      } else if (draft.intent === "addLiquidity") {
        if (p.usdcEquivalentTotal) {
          prompt = `You want to add liquidity with ${p.usdcEquivalentTotal} USDC equivalent total into ${p.token0 || "USDC"}/${p.token1 || "USDT"} (split 50/50 by value). Proceed?`;
          const stableSymbols = new Set(["USDC", "USDT"]);
          const t0 = (p.token0 || "").toUpperCase();
          const t1 = (p.token1 || "").toUpperCase();
          const hasStableSide = stableSymbols.has(t0) || stableSymbols.has(t1);
          if (!hasStableSide) {
            prompt += "\nNote: this pair has no USDC/USDT side. Confirm the quote basis before execution.";
          }
        } else {
          prompt = `You want to add liquidity: ${p.amount0 || p.amount || "0"} ${p.token0 || "USDC"} + ${p.amount1 || "0"} ${p.token1 || "USDT"}. Proceed?`;
        }
      } else if (draft.intent === "removeLiquidity") {
        const rawAmt = p.lpAmount || p.amount || "";
        const amountLabel = rawAmt ? (String(rawAmt).includes("%") ? `${rawAmt}` : `${rawAmt} LP`) : "liquidity";
        prompt = `You want to remove ${amountLabel} from ${p.token0 || "USDC"}/${p.token1 || "USDT"}. Proceed?`;
      } else if (draft.intent === "bridge") {
        prompt = `You want to bridge ${p.amount || "0"} ${p.token || "USDC"} from ${p.fromChain || "Polkadot Hub"} to ${p.toChain || "Base Sepolia"}. Proceed?`;
      } else if (draft.intent === "stake") {
        prompt = `You want to stake ${p.amount || "0"} ${p.token || "USDC"}. Proceed?`;
      } else if (draft.intent === "unstake") {
        prompt = `You want to unstake ${p.amount || "0"} ${p.token || "USDC"}. Proceed?`;
      } else if (draft.intent === "lend") {
        prompt = `You want to lend ${p.amount || "0"} ${p.token || "USDC"}. Proceed?`;
      } else if (draft.intent === "unlend") {
        prompt = `You want to unlend ${p.amount || "0"} ${p.token || "USDC"}. Proceed?`;
      } else if (draft.intent === "claim") {
        prompt = `You want to claim ${p.amount || "200"} ${p.token || "USDC"}. Proceed?`;
      } else if (draft.intent === "mint") {
        prompt = `You want to mint an NFT from ${p.collection || "DeFAI Access Pass"}. Proceed?`;
      } else if (draft.intent === "launchpad") {
        const taxBps = Number(p.tradingTaxBps || "0");
        const taxPct = Number.isFinite(taxBps) ? (taxBps / 100).toString() : "0";
        const burnShare = Number(p.taxBurnBps || "0");
        const taxTarget =
          p.taxRecipient?.toLowerCase() === BURN_ADDRESS.toLowerCase()
            ? "burn address"
            : (p.taxRecipient || "not set (no tax)");
        prompt =
          `You want to create token ${p.tokenName || "My Token"} (${p.tokenSymbol || "MYT"}) with total supply ${p.totalSupply || "1000000"}.` +
          `\nBurn enabled: ${p.burnEnabled || "yes"}.` +
          `\nTrading tax: ${taxPct}% (${taxBps} bps).` +
          `\nTax recipient: ${taxTarget}.` +
          `\nTax burn share: ${burnShare} bps of tax.` +
          `\nRule: tax only applies if you explicitly set a destination (burn address or wallet). If not set, tax is 0.` +
          `\nProceed?`;
      }
      if (draft.warnings?.length) {
        prompt += `\nNote: ${draft.warnings[0]}`;
      }
      return { id: genId(), draft, prompt };
    },
    []
  );

  const buildAddLiquiditySizeSelection = useCallback(
    (draft: TransactionDraft, token0Raw: string, token1Raw: string): PendingConfirmation => {
      const token0 = canonicalTokenSymbol(token0Raw) || "USDC";
      const token1 = canonicalTokenSymbol(token1Raw) || "USDT";
      return {
        id: genId(),
        draft: {
          ...draft,
          params: {
            ...draft.params,
            token0,
            token1,
          },
        },
        selectionField: "lpAmount",
        options: ["10%", "25%", "50%", "75%", "100%"],
        prompt: `How much of your wallet balance should I use for ${token0}/${token1} liquidity?`,
        customInput: {
          placeholder: `${token0}/${token1}: amount0,amount1 (e.g. 100,200) or a percent like 50%`,
          submitLabel: "Use",
        },
      };
    },
    [canonicalTokenSymbol]
  );

  const buildAmountPercentSelection = useCallback(
    (draft: TransactionDraft, tokenSymbolRaw: string, intentLabel: "swap" | "stake" | "unstake"): PendingConfirmation => {
      const tokenSymbol = canonicalTokenSymbol(tokenSymbolRaw) || "USDC";
      const basisType = draft.params.basisType;
      const basisAmountRaw = draft.params.basisAmount;
      const hasStakedBasis = intentLabel === "unstake" && basisType === "staked" && !!basisAmountRaw;

      const balance =
        hasStakedBasis ? Number(basisAmountRaw) : getBalanceBySymbol(tokenSymbol);
      const balanceLabel = Number(balance).toLocaleString("en-US", { maximumFractionDigits: 6 });
      const verb = intentLabel === "swap" ? "swap" : intentLabel === "stake" ? "stake" : "unstake";
      const basisWord = hasStakedBasis ? "staked" : "wallet";
      return {
        id: genId(),
        draft,
        selectionField: "amount",
        options: ["10%", "25%", "50%", "75%", "100%"],
        prompt: `How much ${tokenSymbol} do you want to ${verb}? ${basisWord === "staked" ? "Staked" : "Wallet"} balance: ${balanceLabel} ${tokenSymbol}.`,
        customInput: {
          placeholder: `Custom amount, e.g. 123.45`,
          submitLabel: "Use",
        },
      };
    },
    [canonicalTokenSymbol, getBalanceBySymbol]
  );

  const applyPercentAmountToDraft = useCallback(
    (draft: TransactionDraft, percent: number): TransactionDraft => {
      const p = Math.max(0, Math.min(100, percent));
      const tokenSymbol =
        draft.intent === "swap"
          ? canonicalTokenSymbol(draft.params.fromToken || "USDC")
          : canonicalTokenSymbol(draft.params.token || "USDC");

      const basisAmountRaw = draft.params.basisAmount;
      const basisType = draft.params.basisType;
      const basisFromDraft = basisAmountRaw ? Number(basisAmountRaw) : NaN;
      const balance =
        basisType === "staked" && Number.isFinite(basisFromDraft) ? basisFromDraft : getBalanceBySymbol(tokenSymbol);

      const amount = toCleanAmount((balance * p) / 100);
      const warnings = [...(draft.warnings || [])];
      const basisLabel = basisType === "staked" ? "staked" : "wallet";
      warnings.push(`Derived amount from ${p}% of current ${basisLabel} ${tokenSymbol} balance.`);

      if (draft.intent === "swap") {
        return {
          ...draft,
          summary: `Swap ${amount} ${tokenSymbol} to ${draft.params.toToken || "USDT"}`,
          params: { ...draft.params, amount, fromToken: tokenSymbol },
          warnings,
        };
      }
      if (draft.intent === "stake") {
        return {
          ...draft,
          summary: `Stake ${amount} ${tokenSymbol}`,
          params: { ...draft.params, amount, token: tokenSymbol },
          warnings,
        };
      }
      if (draft.intent === "unstake") {
        return {
          ...draft,
          summary: `Unstake ${amount} ${tokenSymbol}`,
          params: { ...draft.params, amount, token: tokenSymbol },
          warnings,
        };
      }
      return draft;
    },
    [canonicalTokenSymbol, getBalanceBySymbol, toCleanAmount]
  );

  const buildTickerDisambiguation = useCallback(
    (draft: TransactionDraft, field: "toToken" | "token"): PendingConfirmation => {
      return {
        id: genId(),
        draft,
        selectionField: field,
        options: ["TCC", "TCX", "TCH"],
        prompt:
          "TwinChain Credit has multiple tickers. Please pick one: TCC, TCX, or TCH.",
      };
    },
    []
  );

  const buildUnstructuredDraft = useCallback(
    (command: string): PendingConfirmation | null => {
      const lower = command.toLowerCase();
      const hasLiquidityWord = hasLiquidityKeyword(lower);
      const isAddLiquidityPhrase =
        hasLiquidityWord &&
        (/\b(add|provide|deposit)\b/i.test(lower) || /\bpair\b|\/|paired|equivalent|pool\b/i.test(lower));
      const isRemoveLiquidityPhrase = hasLiquidityWord && /\b(remove|withdraw|exit)\b/i.test(lower);
      const launchTokenRequested =
        /\b(create|deploy|launch)\b[\w\s]{0,20}\btoken\b/i.test(command) ||
        /\btoken\s*(name|ticker|symbol)\b/i.test(command) ||
        /\btotal\s+supply\b/i.test(lower) ||
        /\bbuy\s+and\s+sell\s+tax\b/i.test(lower);
      const tokenMatch = lower.match(/\$?(usdc|usdt|dot|eth|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/i);
      const token = (tokenMatch?.[1] || "USDC").toUpperCase();
      const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
      const amountMatch = lower.match(/(\d+(?:\.\d+)?)/);
      const tokenBalance = balances.find((b) => canonicalTokenSymbol(b.symbol) === token);
      const balanceNum = tokenBalance ? Number(tokenBalance.formatted) : NaN;

      const resolveAmount = (fallback: number) => {
        if (pctMatch && Number.isFinite(balanceNum) && balanceNum > 0) {
          const pct = Math.min(Number(pctMatch[1]), 100);
          if (Number.isFinite(pct) && pct > 0) {
            return {
              amount: toCleanAmount((balanceNum * pct) / 100),
              warning: `Derived amount from ${pct}% of current ${token} balance.`,
            };
          }
        }
        if (amountMatch) return { amount: amountMatch[1], warning: undefined as string | undefined };
        return { amount: toCleanAmount(fallback), warning: undefined as string | undefined };
      };

      let draft: TransactionDraft | null = null;

      if (/(mint).*(nft|access pass)|(nft).*(mint)/i.test(lower)) {
        draft = {
          intent: "mint",
          summary: "Mint NFT access pass",
          params: { collection: "DeFAI Access Pass", chain: "Polkadot Hub Testnet" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
        };
      } else if (lower.includes("bridge")) {
        const { amount, warning } = resolveAmount(token === "ETH" || token === "DOT" ? 0.05 : 10);
        const fromChain = lower.includes("from base")
          ? "Base Sepolia"
          : lower.includes("from polkadot") || lower.includes("from hub")
            ? "Polkadot Hub Testnet"
            : "Polkadot Hub Testnet";
        const toChain = lower.includes("to base")
          ? "Base Sepolia"
          : lower.includes("to polkadot") || lower.includes("to hub")
            ? "Polkadot Hub Testnet"
            : fromChain.includes("Base")
              ? "Polkadot Hub Testnet"
              : "Base Sepolia";
        draft = {
          intent: "bridge",
          summary: `Bridge ${amount} ${token} from ${fromChain} to ${toChain}`,
          params: { amount, token, fromChain, toChain, bridgeProtocol: "DeFAI Instant Relayer Bridge" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
      } else if (isAddLiquidityPhrase) {
        const looseAmounts = [...command.matchAll(/(\d[\d.,oO]*)/g)].map((m) => parseLooseAmount(m[1], "0"));
        const hasPercentSizing = !!pctMatch;
        const hasExplicitAmounts = looseAmounts.length > 0 && !hasPercentSizing;
        const amountA = looseAmounts[0] || "";
        const amountB = looseAmounts[1] || amountA || "";
        const hasEquivalentMode = /\bequivalent\b|\beqv\b|\bvalue\b/i.test(lower);
        const symbols = [...lower.matchAll(/\$?(usdc|usdt|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/gi)].map((m) =>
          m[1].toUpperCase()
        );
        const [suggested0, suggested1] = (addLiquidityPairOptions[0] || "USDC/USDT").split("/");
        const token0 = symbols[0] || suggested0 || "USDC";
        const token1 = symbols[1] || suggested1 || (token0 === "USDC" ? "USDT" : "USDC");
        const totalEquivalent = hasEquivalentMode && looseAmounts.length === 1 ? amountA || "0" : undefined;
        const halfEquivalent = totalEquivalent ? toCleanAmount(Number(totalEquivalent) / 2) : undefined;
        const stableSymbols = new Set(["USDC", "USDT"]);
        const hasStableSide = stableSymbols.has(token0) || stableSymbols.has(token1);
        const baseAddDraft: TransactionDraft = {
          intent: "addLiquidity",
          summary: totalEquivalent
            ? `Add liquidity (${totalEquivalent} USDC equivalent total) into ${token0}/${token1}`
            : `Add liquidity into ${token0}/${token1}`,
          params: totalEquivalent
            ? {
                usdcEquivalentTotal: totalEquivalent,
                amount0: halfEquivalent || amountA || "",
                amount1: halfEquivalent || amountA || "",
                token0,
                token1,
                protocol: "DeFAI AMM Pool",
              }
            : { amount0: amountA, amount1: amountB, token0, token1, protocol: "DeFAI AMM Pool" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings:
            totalEquivalent && !hasStableSide
              ? ["USDC-equivalent mode is most reliable when one side is USDC/USDT. This pair has no stable side; review quote basis."]
              : undefined,
        };
        draft = hasExplicitAmounts || totalEquivalent
          ? baseAddDraft
          : hasPercentSizing
            ? buildAddLiquidityDraftFromPair(token0, token1, baseAddDraft, Math.min(Number(pctMatch?.[1] || "0"), 100))
            : baseAddDraft;
      } else if (isRemoveLiquidityPhrase) {
        const pctMatchLocal = lower.match(/(\d+(?:\.\d+)?)\s*%/);
        const hasMax = /\b(all|max)\b/i.test(lower);
        const lpAmount = hasMax
          ? "100%"
          : pctMatchLocal
            ? `${pctMatchLocal[1]}%`
            : amountMatch
              ? parseLooseAmount(amountMatch[1], "0")
              : "";
        const symbols = [...lower.matchAll(/\$?(usdc|usdt|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/gi)].map((m) =>
          m[1].toUpperCase()
        );
        const token0 = symbols[0];
        const token1 = symbols[1];
        draft = {
          intent: "removeLiquidity",
          summary: lpAmount
            ? `Remove liquidity: ${lpAmount}${lpAmount.includes("%") ? "" : " LP"}`
            : "Remove liquidity",
          params: { lpAmount, token0, token1, protocol: "DeFAI AMM Pool" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
        };
      } else if (/\bswa[a-z\[\]]*|\bexchange\b/i.test(lower)) {
        const ambiguousTwinchain =
          lower.includes("twinchain credit") && !/\b(tcc|tcx|tch)\b/i.test(lower);
        const tokenSymbols = [...lower.matchAll(/\$?(usdc|usdt|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/gi)].map((m) =>
          m[1].toUpperCase()
        );
        let fromToken = tokenSymbols[0] || "USDC";
        let toToken = ambiguousTwinchain
          ? "TCC"
          : tokenSymbols[1] || (fromToken === "USDC" ? "USDT" : "USDC");
        if (fromToken === toToken) toToken = fromToken === "USDC" ? "USDT" : "USDC";
        const fromBal = balances.find((b) => canonicalTokenSymbol(b.symbol) === fromToken);
        const fromBalNum = fromBal ? Number(fromBal.formatted) : NaN;
        let amount = amountMatch?.[1] || "10";
        let warning: string | undefined;
        if (pctMatch && Number.isFinite(fromBalNum) && fromBalNum > 0) {
          const pct = Math.min(Number(pctMatch[1]), 100);
          amount = toCleanAmount((fromBalNum * pct) / 100);
          warning = `Derived amount from ${pct}% of current ${fromToken} balance.`;
        }
        draft = {
          intent: "swap",
          summary: `Swap ${amount} ${fromToken} to ${toToken}`,
          params: { amount, fromToken, toToken, protocol: "DeFAI AMM Pool", slippage: "0.5%" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
        if (ambiguousTwinchain) {
          return buildTickerDisambiguation(draft, "toToken");
        }
      } else if (launchTokenRequested) {
        const nameMatch =
          command.match(/(?:token\s+name|name)\s*(?:is|=|:)?\s*["']?([a-zA-Z0-9][a-zA-Z0-9\s\-]{1,60}?)(?=,|\.|\b(total\s+supply|supply|tax|burn|ticker|symbol)\b|$)/i) ||
          command.match(/named\s+["']?([a-zA-Z0-9][a-zA-Z0-9\s\-]{1,60}?)(?=,|\.|\b(total\s+supply|supply|tax|burn|ticker|symbol)\b|$)/i);
        const tickerMatch =
          command.match(/\$([a-zA-Z0-9]{2,10})/) ||
          command.match(/(?:ticker|symbol)\s*(?:is|=|:)?\s*([a-zA-Z0-9]{2,10})/i);
        const supplyMatch =
          command.match(/(?:total\s*supply|supply)\s*(?:is|=|:)?\s*([\d,]+(?:\.\d+)?)/i) ||
          command.match(/\bsupply\s+of\s+([\d,]+(?:\.\d+)?)/i);
        const taxPctMatch =
          command.match(/(?:buy\s+and\s+sell\s+)?(?:trading\s+)?tax\s*(?:is|=|:)?\s*(\d+(?:\.\d+)?)\s*%/i) ||
          command.match(/(\d+(?:\.\d+)?)\s*%\s*(?:buy\s+and\s+sell\s+)?(?:trading\s+)?tax/i);
        const burnTaxPctMatch = command.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:of\s*)?tax\s*(?:to\s*)?burn/i);
        const recipientMatch = command.match(/0x[a-fA-F0-9]{40}/);
        const allTaxToBurn = /\b(all|100%)\s+tax\s+(goes|go)\s+to\s+burn\b/i.test(lower) || /\bburn address\b/i.test(lower);
        const hasExplicitTaxDestination = allTaxToBurn || !!recipientMatch;
        const burnEnabled = !/\b(no burn|without burn|burn off|burn disabled)\b/i.test(lower);

        const tokenName = nameMatch?.[1]?.trim()?.replace(/\s+/g, " ") || "My Launch Token";
        const initials = tokenName
          .split(/\s+/)
          .map((w) => w[0] || "")
          .join("")
          .toUpperCase()
          .slice(0, 6);
        const tokenSymbol = (tickerMatch?.[1] || initials || "MYT").toUpperCase();
        const totalSupply = (supplyMatch?.[1] || "1000000").replace(/,/g, "");
        const requestedTaxBps = taxPctMatch ? Math.round(Number(taxPctMatch[1]) * 100) : 0;
        const effectiveTaxBps = hasExplicitTaxDestination ? requestedTaxBps : 0;
        const taxBps = String(effectiveTaxBps);
        const taxBurnBps = effectiveTaxBps === 0
          ? "0"
          : allTaxToBurn
            ? "10000"
            : burnTaxPctMatch
              ? String(Math.round(Number(burnTaxPctMatch[1]) * 100))
              : "0";
        const taxRecipient = effectiveTaxBps === 0 ? "" : allTaxToBurn ? BURN_ADDRESS : recipientMatch?.[0] || "";
        const warnings: string[] = [];
        if (requestedTaxBps > 0 && !hasExplicitTaxDestination) {
          warnings.push("Tax percentage was provided but tax destination was not specified. Tax has been set to 0.");
        }

        draft = {
          intent: "launchpad",
          summary: `Create token ${tokenName} (${tokenSymbol}) with supply ${totalSupply}`,
          params: {
            tokenName,
            tokenSymbol,
            totalSupply,
            burnEnabled: burnEnabled ? "yes" : "no",
            burnMechanism: burnEnabled ? "enabled" : "disabled",
            tradingTaxBps: taxBps,
            taxBurnBps,
            taxRecipient,
            protocol: "DeFAITokenFactory",
            platform: "DeFAI Launchpad",
            standard: "ERC20",
          },
          gasEstimate: "~0.003 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warnings.length ? warnings : undefined,
        };
      } else if (lower.includes("unlend") || (lower.includes("withdraw") && /\blend\b/i.test(lower))) {
        const { amount, warning } = resolveAmount(10);
        draft = {
          intent: "unlend",
          summary: `Unlend ${amount} ${token === "USDT" ? "USDT" : "USDC"}`,
          params: { amount, token: token === "USDT" ? "USDT" : "USDC", protocol: "DeFAI Lending Vault (demo)" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
      } else if (
        /\blend\b/i.test(lower) ||
        (/\bsupply\b/i.test(lower) && !/\btotal\s+supply\b/i.test(lower) && !launchTokenRequested)
      ) {
        const { amount, warning } = resolveAmount(10);
        draft = {
          intent: "lend",
          summary: `Lend ${amount} ${token === "USDT" ? "USDT" : "USDC"}`,
          params: { amount, token: token === "USDT" ? "USDT" : "USDC", protocol: "DeFAI Lending Vault (demo)" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
      } else if (lower.includes("unstake")) {
        const { amount, warning } = resolveAmount(10);
        draft = {
          intent: "unstake",
          summary: `Unstake ${amount} ${token === "USDT" ? "USDT" : "USDC"}`,
          params: { amount, token: token === "USDT" ? "USDT" : "USDC", protocol: "DeFAIStakingVault" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
      } else if (lower.includes("stake")) {
        const { amount, warning } = resolveAmount(10);
        draft = {
          intent: "stake",
          summary: `Stake ${amount} ${token === "USDT" ? "USDT" : "USDC"}`,
          params: { amount, token: token === "USDT" ? "USDT" : "USDC", protocol: "DeFAIStakingVault" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
      } else if (lower.includes("claim") || (lower.includes("mint") && (lower.includes("usdc") || lower.includes("usdt")))) {
        const { amount, warning } = resolveAmount(200);
        draft = {
          intent: "claim",
          summary: `Claim ${amount} ${token === "USDT" ? "USDT" : "USDC"}`,
          params: { amount, token: token === "USDT" ? "USDT" : "USDC", protocol: "DeFAI Demo Faucet" },
          gasEstimate: "~0.001 DOT",
          message: "Prepared from your unstructured prompt.",
          warnings: warning ? [warning] : undefined,
        };
      }

      if (!draft) return null;
      return buildPendingConfirmation(draft);
    },
    [
      addLiquidityPairOptions,
      balances,
      buildAddLiquidityDraftFromPair,
      buildPendingConfirmation,
      buildTickerDisambiguation,
      canonicalTokenSymbol,
      hasLiquidityKeyword,
      toCleanAmount,
    ]
  );

  const handleNewChat = useCallback(() => {
    const activeThread = conversations.find((c) => c.id === activeConversationId);
    const isActiveEmpty =
      !!activeThread &&
      (activeThread.messages?.length ?? 0) === 0 &&
      (activeThread.actions?.length ?? 0) === 0;

    if (isActiveEmpty) {
      setMessages([]);
      setActions([]);
      setPendingConfirmation(null);
      resetExec();
      setActiveTab("home");
      return;
    }

    const id = genId();
    const now = Date.now();
    const thread: ConversationThread = {
      id,
      title: "New chat",
      messages: [],
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
    setConversations((prev) => [thread, ...prev]);
    setActiveConversationId(id);
    setMessages([]);
    setActions([]);
    setPendingConfirmation(null);
    resetExec();
  }, [conversations, activeConversationId, resetExec]);

  // Load conversation threads on wallet change.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(conversationsStorageKey);
      const parsed = raw ? (JSON.parse(raw) as ConversationThread[]) : [];
      const threads = Array.isArray(parsed) ? parsed : [];
      if (threads.length === 0) {
        const id = genId();
        const now = Date.now();
        const initialThread: ConversationThread = {
          id,
          title: "New chat",
          messages: [],
          actions: [],
          createdAt: now,
          updatedAt: now,
        };
        setConversations([initialThread]);
        setActiveConversationId(id);
        setMessages([]);
        setActions([]);
        return;
      }

      setConversations(threads);
      const savedActive = localStorage.getItem(activeConversationStorageKey);
      const preferred = savedActive && threads.some((t) => t.id === savedActive) ? savedActive : threads[0].id;
      setActiveConversationId(preferred);
      const activeThread = threads.find((t) => t.id === preferred) || threads[0];
      setMessages(activeThread.messages || []);
      setActions(activeThread.actions || []);
    } catch {
      const id = genId();
      const now = Date.now();
      const fallbackThread: ConversationThread = {
        id,
        title: "New chat",
        messages: [],
        actions: [],
        createdAt: now,
        updatedAt: now,
      };
      setConversations([fallbackThread]);
      setActiveConversationId(id);
      setMessages([]);
      setActions([]);
    }
  }, [conversationsStorageKey, activeConversationStorageKey]);

  // Persist conversation threads and active pointer.
  useEffect(() => {
    try {
      localStorage.setItem(conversationsStorageKey, JSON.stringify(conversations));
    } catch {
      // ignore storage quota errors
    }
  }, [conversationsStorageKey, conversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    try {
      localStorage.setItem(activeConversationStorageKey, activeConversationId);
    } catch {
      // ignore storage errors
    }
  }, [activeConversationStorageKey, activeConversationId]);

  // Sync active thread content whenever messages/actions change.
  useEffect(() => {
    if (!activeConversationId) return;
    setConversations((prev) =>
      prev.map((thread) =>
        thread.id === activeConversationId
          ? {
              ...thread,
              messages: messages.slice(-200),
              actions,
              updatedAt: Date.now(),
            }
          : thread
      )
    );
  }, [activeConversationId, messages, actions]);

  // Push execution progress directly into chat stream.
  useEffect(() => {
    if (execState.step === lastExecStepRef.current) return;
    lastExecStepRef.current = execState.step;

    if (execState.step === "idle" || execState.step === "finalized" || execState.step === "error") return;

    if (execState.step === "approving") {
      pushAssistantMessage("Execution update: approving token spend...");
      return;
    }
    if (execState.step === "simulating") {
      pushAssistantMessage("Execution update: running preflight safety check...");
      return;
    }
    if (execState.step === "awaiting-signature") {
      pushAssistantMessage("Execution update: awaiting wallet signature...");
      return;
    }
    if (execState.step === "broadcasting") {
      pushAssistantMessage(
        `Execution update: transaction broadcasted.${execState.txHash ? `\nTx ID: ${execState.txHash}` : ""}`
      );
      return;
    }
    if (execState.step === "confirming") {
      pushAssistantMessage("Execution update: waiting for on-chain confirmation...");
    }
  }, [execState.step, execState.txHash, pushAssistantMessage]);

  // While confirming, post periodic "still waiting" heartbeats so users don't think it's stuck.
  useEffect(() => {
    const stop = () => {
      if (confirmHeartbeatRef.current.timer) {
        window.clearInterval(confirmHeartbeatRef.current.timer);
      }
      confirmHeartbeatRef.current.timer = null;
      confirmHeartbeatRef.current.count = 0;
      confirmHeartbeatRef.current.startedAt = 0;
      confirmHeartbeatRef.current.lastHash = null;
    };

    if (execState.step !== "confirming") {
      stop();
      return;
    }

    const hash = execState.txHash ?? null;
    const isNewHash = hash && hash !== confirmHeartbeatRef.current.lastHash;
    if (isNewHash || !confirmHeartbeatRef.current.startedAt) {
      confirmHeartbeatRef.current.startedAt = Date.now();
      confirmHeartbeatRef.current.count = 0;
      confirmHeartbeatRef.current.lastHash = hash;
    }

    if (confirmHeartbeatRef.current.timer) return;

    // Every 20s, up to 6 messages (~2 minutes). After that, we stop spamming.
    confirmHeartbeatRef.current.timer = window.setInterval(() => {
      if (confirmHeartbeatRef.current.count >= 6) {
        stop();
        return;
      }
      const elapsedSec = Math.max(0, Math.floor((Date.now() - confirmHeartbeatRef.current.startedAt) / 1000));
      const mins = Math.floor(elapsedSec / 60);
      const secs = elapsedSec % 60;
      const elapsedLabel = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
      const explorer =
        hash && (chainId === BASE_SEPOLIA_CHAIN_ID
          ? `https://sepolia.basescan.org/tx/${hash}`
          : `https://blockscout-passet-hub.parity-testnet.parity.io/tx/${hash}`);
      pushAssistantMessage(
        `Execution update: still waiting for confirmation (${elapsedLabel}).${hash ? `\\nTx ID: ${hash}` : ""}${
          explorer ? `\\nExplorer: ${explorer}` : ""
        }`
      );
      confirmHeartbeatRef.current.count += 1;
    }, 20_000);

    return stop;
  }, [execState.step, execState.txHash, chainId, pushAssistantMessage]);

  const handleCommand = useCallback(async (command: string) => {
    setActiveTab("home");
    setPendingConfirmation(null);
    const userMsg: ChatMessage = { id: genId(), role: "user", content: command };
    setMessages((prev) => [...prev, userMsg]);
    setConversations((prev) =>
      prev.map((thread) => {
        if (thread.id !== activeConversationId) return thread;
        const existingTitle = thread.title || "New chat";
        const shouldReplaceTitle = existingTitle === "New chat" || existingTitle.trim().length === 0;
        return {
          ...thread,
          title: shouldReplaceTitle ? command.slice(0, 60) : existingTitle,
          updatedAt: Date.now(),
        };
      })
    );
    const isBalanceCommand = /(all\s+assets|assets?\s+balance|balances?|portfolio)/i.test(command);
    if (isBalanceCommand) {
      pushAssistantMessage(formatBalancesMessage());
      setActiveTab("portfolio");
      return;
    }

    const isSmallTalk = /^(thanks|thank you|thx|ok|okay|cool|great|nice|got it|hello|hi|hey|bye)\b/i.test(
      command.trim()
    );
    if (isSmallTalk) {
      pushAssistantMessage("You’re welcome. I’m ready when you are — ask me to swap, bridge, stake, mint, or deploy a token.");
      return;
    }

    // DeFi intents always go through defai-agent first (demo / judge visibility). Local parser only on invoke failure.
    setIsProcessing(true);

    try {
      const history = messages
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("defai-agent", {
        body: { command, history, walletContext },
      });

      if (error) {
        console.error("Edge function error:", error);
        const fallbackDraft = buildUnstructuredDraft(command);
        if (fallbackDraft) {
          pushAssistantMessage(
            "DeFAI agent could not be reached — using offline intent parser for this command only."
          );
          setPendingConfirmation(fallbackDraft);
        } else {
          const errContent = "DeFAI agent unavailable and the command could not be parsed offline. Please try again.";
          pushAssistantMessage(errContent);
          toast.error(errContent);
        }
        setIsProcessing(false);
        return;
      }

      if (data?.error) {
        const errContent =
          data.error.includes("Rate limited")
            ? "Rate limited — please wait a moment and try again."
            : data.error.includes("credits")
              ? "AI credits exhausted. Add credits in workspace settings."
              : data.error;
        const fallbackDraft = buildUnstructuredDraft(command);
        if (fallbackDraft) {
          pushAssistantMessage(
            `${errContent} Using offline intent parser for this command only.`
          );
          setPendingConfirmation(fallbackDraft);
        } else {
          pushAssistantMessage(errContent);
          toast.error(errContent);
        }
        setIsProcessing(false);
        return;
      }

      const draft = data as TransactionDraft;
      const lowerCommand = command.toLowerCase();
      const needsTwinchainSelection =
        lowerCommand.includes("twinchain credit") &&
        !/\b(tcc|tcx|tch)\b/i.test(lowerCommand) &&
        (draft.intent === "swap" || draft.intent === "claim");

      // If it's a points query, redirect to points tab and add assistant message
      if (draft.intent === "points") {
        pushAssistantMessage(draft.message || "Opening your points and rank...");
        setActiveTab("points");
        setIsProcessing(false);
        return;
      }

      if (draft.intent === "chat") {
        pushAssistantMessage(draft.message || draft.summary || "Here is what I found.");
        return;
      }

      if (EXECUTABLE_INTENTS.has(draft.intent)) {
        if (draft.intent === "addLiquidity" && !commandMentionsPair(command)) {
          if (addLiquidityPairOptions.length > 1) {
            setPendingConfirmation({
              id: genId(),
              draft,
              selectionField: "liquidityPair",
              options: addLiquidityPairOptions,
              prompt: `Which pair do you want to add liquidity to?\n${addLiquidityPairOptions.join(", ")}`,
            });
            return;
          }
          if (addLiquidityPairOptions.length === 1) {
            const [t0, t1] = addLiquidityPairOptions[0].split("/");
            setPendingConfirmation(buildAddLiquiditySizeSelection(draft, t0, t1));
            return;
          }
        }
        if (draft.intent === "addLiquidity" && !commandMentionsAddAmount(command)) {
          setPendingConfirmation(
            buildAddLiquiditySizeSelection(draft, draft.params.token0 || "USDC", draft.params.token1 || "USDT")
          );
          return;
        }
        if (draft.intent === "stake" || draft.intent === "unstake") {
          const mentioned = extractMentionedSymbols(command);
          const intentLabel = draft.intent === "stake" ? "stake" : "unstake";
          const stakeTickerMentioned = mentioned.filter((s) => stakeableSymbolSet.has(s));

          // No stake ticker in user text — ignore model default (edge fn used to force USDC).
          if (stakeTickerMentioned.length === 0) {
            const clearedDraft: TransactionDraft = { ...draft, params: { ...draft.params } };
            delete clearedDraft.params.token;
            delete clearedDraft.params.amount;

            if (intentLabel === "unstake") {
              const unstakeable = await getUnstakeableTokenOptions();
              if (unstakeable.length === 0) {
                pushAssistantMessage("No staked balance found to unstake.");
                return;
              }
              const lines = await Promise.all(
                unstakeable.map(async (t) => {
                  const st = await getStakedAmountByToken(t);
                  return `• ${t}: ${toCleanAmount(st)} staked`;
                })
              );
              setPendingConfirmation({
                id: genId(),
                draft: clearedDraft,
                selectionField: "token",
                options: unstakeable,
                prompt: `Which asset do you want to unstake?\n${lines.join("\n")}`,
              });
              return;
            }

            const latestStakeable = computeStakeableTokenOptionsFromBalances(balancesRef.current);
            if (latestStakeable.length === 0) {
              if (balancesLoadingRef.current) {
                await waitForBalancesLoaded();
              }
              const latestStakeableAfter = computeStakeableTokenOptionsFromBalances(balancesRef.current);
              if (latestStakeableAfter.length > 0) {
                const lines = latestStakeableAfter.map(
                  (t) => `• ${t}: ${toCleanAmount(getBalanceBySymbolFromRows(balancesRef.current, t))} in wallet`
                );
                setPendingConfirmation({
                  id: genId(),
                  draft: clearedDraft,
                  selectionField: "token",
                  options: latestStakeableAfter,
                  prompt: `Which asset do you want to stake? (vault-supported tokens)\n${lines.join("\n")}`,
                });
                return;
              }
              pushAssistantMessage(
                "No stake-eligible asset with non-zero wallet balance. Fund one of the hub demo tokens that has a vault (USDC, USDT, DOMAIN, TCC, TCX, TCH, PAI, HLT, RWA, YIELD, INFRA, CARB)."
              );
              return;
            }
            const lines = latestStakeable.map(
              (t) => `• ${t}: ${toCleanAmount(getBalanceBySymbolFromRows(balancesRef.current, t))} in wallet`
            );
            setPendingConfirmation({
              id: genId(),
              draft: clearedDraft,
              selectionField: "token",
              options: latestStakeable,
              prompt: `Which asset do you want to stake? (vault-supported tokens)\n${lines.join("\n")}`,
            });
            return;
          }

          const token = canonicalTokenSymbol(stakeTickerMentioned[0] || draft.params.token || "USDC");

          if (intentLabel === "stake" && !computeStakeableTokenOptionsFromBalances(balancesRef.current).includes(token)) {
            pushAssistantMessage(
              `No ${token} balance to stake (or no staking vault for that asset on this network).`
            );
            return;
          }

          if (!commandMentionsAnyAmount(command)) {
            if (intentLabel === "unstake") {
              const staked = await getStakedAmountByToken(token);
              const walletBal = getBalanceBySymbol(token);
              if (!Number.isFinite(staked) || staked <= 0) {
                pushAssistantMessage(`You have no staked ${token} balance to unstake.`);
                return;
              }
              const basisAmount = toCleanAmount(staked);
              setPendingConfirmation({
                id: genId(),
                draft: {
                  ...draft,
                  params: {
                    ...draft.params,
                    token,
                    basisAmount,
                    basisType: "staked",
                  },
                },
                selectionField: "amount",
                options: ["10%", "25%", "50%", "75%", "100%"],
                prompt: `How much ${token} staked balance do you want to unstake?\nStaked balance: ${toCleanAmount(
                  staked
                )} ${token}. Wallet balance: ${toCleanAmount(walletBal)} ${token}.`,
              });
              return;
            }

            setPendingConfirmation(
              buildAmountPercentSelection({ ...draft, params: { ...draft.params, token } }, token, intentLabel)
            );
            return;
          }
        }
        if (draft.intent === "swap") {
          const mentioned = extractMentionedSymbols(command);
          // User didn’t name tickers — ignore model defaults (edge fn used to force USDC) and pick from wallet.
          if (mentioned.length === 0) {
            const clearedDraft: TransactionDraft = { ...draft, params: { ...draft.params } };
            delete clearedDraft.params.fromToken;
            delete clearedDraft.params.toToken;
            delete clearedDraft.params.amount;
            const fromOptions = computeSwapFromTokenOptions(balancesRef.current);
            if (fromOptions.length === 0) {
              if (balancesLoadingRef.current) {
                await waitForBalancesLoaded();
              }
              const fromOptionsAfter = computeSwapFromTokenOptions(balancesRef.current);
              if (fromOptionsAfter.length > 0) {
                setPendingConfirmation({
                  id: genId(),
                  draft: clearedDraft,
                  selectionField: "fromToken",
                  options: fromOptionsAfter,
                  prompt: "Which token do you want to swap from?",
                });
                return;
              }
              pushAssistantMessage(
                "No swappable token with non-zero wallet balance found. You need a hub token that has an AMM pair (e.g. USDC, USDT, DOMAIN, TCC…) — native DOT is not routed through the demo pools."
              );
              return;
            }
            setPendingConfirmation({
              id: genId(),
              draft: clearedDraft,
              selectionField: "fromToken",
              options: fromOptions,
              prompt: "Which token do you want to swap from?",
            });
            return;
          }
          const fromToken = canonicalTokenSymbol(draft.params.fromToken || mentioned[0] || "");
          const toToken = canonicalTokenSymbol(draft.params.toToken || mentioned[1] || "");
          if ((mentioned.length === 1 && !draft.params.toToken) || (fromToken && !toToken)) {
            const toOptions = getSwapCounterpartOptions(fromToken).filter((s) => s !== fromToken);
            if (toOptions.length > 0) {
              setPendingConfirmation({
                id: genId(),
                draft: { ...draft, params: { ...draft.params, fromToken } },
                selectionField: "toToken",
                options: toOptions,
                prompt: `Which token do you want to receive for ${fromToken}?`,
              });
              return;
            }
          }
          if (!commandMentionsAnyAmount(command)) {
            setPendingConfirmation(
              buildAmountPercentSelection(
                { ...draft, params: { ...draft.params, fromToken, toToken } },
                fromToken || "USDC",
                "swap"
              )
            );
            return;
          }
        }
        if (draft.intent === "removeLiquidity" && draft.params.requiresPair === "true") {
          const pairs = (draft.params.availablePairs || "")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          if (pairs.length > 0) {
            setPendingConfirmation({
              id: genId(),
              draft,
              selectionField: "liquidityPair",
              options: pairs,
              prompt: draft.message || `Which pair should I remove from?\n${pairs.join(", ")}`,
            });
          } else {
            pushAssistantMessage(draft.message || "I could not find a removable liquidity pair for this wallet.");
          }
          return;
        }
        if (draft.intent === "removeLiquidity" && draft.params.requiresAmount === "true") {
          const pairLabel =
            draft.params.token0 && draft.params.token1
              ? `${draft.params.token0}/${draft.params.token1}`
              : "";
          const options = (draft.params.suggestedPercents || "25%,50%,75%,100%")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          setPendingConfirmation({
            id: genId(),
            draft,
            selectionField: "lpAmount",
            options,
            prompt: draft.message || (pairLabel
              ? `How much liquidity should I remove from ${pairLabel}?`
              : "How much liquidity should I remove?"),
            customInput: {
              placeholder: "Custom LP amount (e.g. 10, 25%, max)",
              submitLabel: "Use",
            },
          });
          return;
        }
        if (draft.intent === "removeLiquidity" && !commandMentionsPair(command)) {
          if (effectiveLiquidityPairOptions.length > 1) {
            setPendingConfirmation({
              id: genId(),
              draft,
              selectionField: "liquidityPair",
              options: effectiveLiquidityPairOptions,
              prompt: `You have multiple liquidity positions. Which pair should I remove from?\n${effectiveLiquidityPairOptions.join(", ")}`,
            });
            return;
          }
          if (effectiveLiquidityPairOptions.length === 1) {
            const [t0, t1] = effectiveLiquidityPairOptions[0].split("/");
            const nextDraft: TransactionDraft = {
              ...draft,
              params: { ...draft.params, token0: t0, token1: t1 },
            };
            if (!commandMentionsRemoveAmount(command)) {
              setPendingConfirmation({
                id: genId(),
                draft: nextDraft,
                selectionField: "lpAmount",
                options: ["25%", "50%", "75%", "100%"],
                prompt: "How much liquidity should I remove?",
                customInput: {
                  placeholder: "Custom LP amount (e.g. 10, 25%, max)",
                  submitLabel: "Use",
                },
              });
              return;
            }
            setPendingConfirmation(buildPendingConfirmation(nextDraft));
            return;
          }
          pushAssistantMessage("No removable liquidity position found yet for this wallet.");
          return;
        }
        if (draft.intent === "removeLiquidity" && !commandMentionsRemoveAmount(command)) {
          setPendingConfirmation({
            id: genId(),
            draft,
            selectionField: "lpAmount",
            options: ["25%", "50%", "75%", "100%"],
            prompt: "How much liquidity should I remove?",
            customInput: {
              placeholder: "Custom LP amount (e.g. 10, 25%, max)",
              submitLabel: "Use",
            },
          });
          return;
        }
        if (needsTwinchainSelection) {
          const field = draft.intent === "swap" ? "toToken" : "token";
          setPendingConfirmation(buildTickerDisambiguation(draft, field));
          return;
        }
        setPendingConfirmation(buildPendingConfirmation(draft));
        return;
      }

      pushAssistantMessage(draft.message || draft.summary || "Here’s your transaction draft.");
      const id = Date.now().toString();
      setActions((prev) => {
        const incomingKey = draftKey(draft);
        const exists = prev.some((a) => draftKey(a.draft) === incomingKey);
        if (exists) return prev;
        return [{ id, draft }, ...prev];
      });
    } catch (err) {
      console.error("Command error:", err);
      const errContent = "Something went wrong. Please try again.";
      pushAssistantMessage(errContent);
      toast.error(errContent);
    } finally {
      setIsProcessing(false);
    }
  }, [
    activeConversationId,
    addLiquidityPairOptions,
    address,
    balancesError,
    balancesLoading,
    buildAddLiquidityDraftFromPair,
    buildAddLiquiditySizeSelection,
    formatBalancesMessage,
    pushAssistantMessage,
    buildUnstructuredDraft,
    buildPendingConfirmation,
    buildTickerDisambiguation,
    buildAmountPercentSelection,
    commandMentionsAddAmount,
    commandMentionsAnyAmount,
    commandMentionsPair,
    commandMentionsRemoveAmount,
    extractMentionedSymbols,
    canonicalTokenSymbol,
    tokenOptionsByBalance,
    stakeableTokenOptions,
    getUnstakeableTokenOptions,
    getSwapCounterpartOptions,
    computeSwapFromTokenOptions,
    computeStakeableTokenOptionsFromBalances,
    getBalanceBySymbolFromRows,
    effectiveLiquidityPairOptions,
    onchainLiquidityPairOptions,
    readOnchainLiquidityPairs,
    walletContext,
    messages,
    getBalanceBySymbol,
    getStakedAmountByToken,
    toCleanAmount,
    stakeableSymbolSet,
  ]);

  const handleConfirmYes = useCallback(() => {
    if (!pendingConfirmation) return;
    if (pendingConfirmation.options?.length) return;
    const draft = pendingConfirmation.draft;
    setActions((prev) => {
      const incomingKey = draftKey(draft);
      const exists = prev.some((a) => draftKey(a.draft) === incomingKey);
      if (exists) return prev;
      return [{ id: Date.now().toString(), draft }, ...prev];
    });
    pushAssistantMessage("Confirmed. I prepared the action — click `Sign & Execute` to proceed.");
    setPendingConfirmation(null);
  }, [pendingConfirmation, pushAssistantMessage]);

  const handleSelectOption = useCallback(
    async (option: string) => {
      if (!pendingConfirmation?.selectionField) return;
      let nextDraft: TransactionDraft;
      if (pendingConfirmation.selectionField === "liquidityPair") {
        const [token0, token1] = option.toUpperCase().split("/");
        nextDraft = {
          ...pendingConfirmation.draft,
          params: {
            ...pendingConfirmation.draft.params,
            token0: token0 || pendingConfirmation.draft.params.token0,
            token1: token1 || pendingConfirmation.draft.params.token1,
          },
        };
        if (pendingConfirmation.draft.intent === "addLiquidity") {
          setPendingConfirmation(
            buildAddLiquiditySizeSelection(
              nextDraft,
              nextDraft.params.token0 || token0 || "USDC",
              nextDraft.params.token1 || token1 || "USDT"
            )
          );
          return;
        }
        if (pendingConfirmation.draft.intent === "removeLiquidity" && pendingConfirmation.draft.params.requiresAmount === "true") {
          const options = (pendingConfirmation.draft.params.suggestedPercents || "25%,50%,75%,100%")
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean);
          setPendingConfirmation({
            id: genId(),
            draft: nextDraft,
            selectionField: "lpAmount",
            options,
            prompt: nextDraft.message || "How much liquidity should I remove?",
          });
          return;
        }
      } else {
        if (pendingConfirmation.selectionField === "fromToken" && pendingConfirmation.draft.intent === "swap") {
          const fromToken = canonicalTokenSymbol(option);
          const toOptions = getSwapCounterpartOptions(fromToken).filter((s) => s !== fromToken);
          const next = {
            ...pendingConfirmation.draft,
            params: { ...pendingConfirmation.draft.params, fromToken },
          };
          if (toOptions.length > 0) {
            setPendingConfirmation({
              id: genId(),
              draft: next,
              selectionField: "toToken",
              options: toOptions,
              prompt: `Which token do you want to receive for ${fromToken}?`,
            });
            return;
          }
          setPendingConfirmation(buildAmountPercentSelection(next, fromToken, "swap"));
          return;
        }
        if (pendingConfirmation.selectionField === "toToken" && pendingConfirmation.draft.intent === "swap") {
          const next = {
            ...pendingConfirmation.draft,
            params: { ...pendingConfirmation.draft.params, toToken: canonicalTokenSymbol(option) },
          };
          setPendingConfirmation(buildAmountPercentSelection(next, next.params.fromToken || "USDC", "swap"));
          return;
        }
        if (pendingConfirmation.selectionField === "token" && pendingConfirmation.draft.intent === "stake") {
          const token = canonicalTokenSymbol(option);
          const next = {
            ...pendingConfirmation.draft,
            params: { ...pendingConfirmation.draft.params, token },
          };
          setPendingConfirmation(buildAmountPercentSelection(next, token, "stake"));
          return;
        }
        if (pendingConfirmation.selectionField === "token" && pendingConfirmation.draft.intent === "unstake") {
          const token = canonicalTokenSymbol(option);
          const staked = await getStakedAmountByToken(token);
          if (!Number.isFinite(staked) || staked <= 0) {
            pushAssistantMessage(`You have no staked ${token} balance to unstake.`);
            return;
          }
          const basisAmount = toCleanAmount(staked);
          setPendingConfirmation({
            id: genId(),
            draft: {
              ...pendingConfirmation.draft,
              params: {
                ...pendingConfirmation.draft.params,
                token,
                basisAmount,
                basisType: "staked",
              },
            },
            selectionField: "amount",
            options: ["10%", "25%", "50%", "75%", "100%"],
            prompt: `How much ${token} staked balance do you want to unstake?\nStaked balance: ${basisAmount} ${token}.`,
          });
          return;
        }
        if (pendingConfirmation.selectionField === "lpAmount" && pendingConfirmation.draft.intent === "addLiquidity") {
          const pctRaw = option.toLowerCase().includes("max")
            ? "100"
            : String(option).replace(/[^0-9.]/g, "");
          const pct = Math.max(0, Math.min(100, Number(pctRaw || "0")));
          const token0 = pendingConfirmation.draft.params.token0 || "USDC";
          const token1 = pendingConfirmation.draft.params.token1 || "USDT";
          const sizedDraft = buildAddLiquidityDraftFromPair(token0, token1, pendingConfirmation.draft, pct);
          setPendingConfirmation(buildPendingConfirmation(sizedDraft));
          return;
        }
        if (pendingConfirmation.selectionField === "amount" && (
          pendingConfirmation.draft.intent === "swap" ||
          pendingConfirmation.draft.intent === "stake" ||
          pendingConfirmation.draft.intent === "unstake"
        )) {
          const pctRaw = option.toLowerCase().includes("max")
            ? "100"
            : String(option).replace(/[^0-9.]/g, "");
          const pct = Math.max(0, Math.min(100, Number(pctRaw || "0")));
          const sizedDraft = applyPercentAmountToDraft(pendingConfirmation.draft, pct);
          setPendingConfirmation(buildPendingConfirmation(sizedDraft));
          return;
        }
        nextDraft = {
          ...pendingConfirmation.draft,
          params: {
            ...pendingConfirmation.draft.params,
            [pendingConfirmation.selectionField]: option,
          },
        };
      }
      setActions((prev) => {
        const incomingKey = draftKey(nextDraft);
        const exists = prev.some((a) => draftKey(a.draft) === incomingKey);
        if (exists) return prev;
        return [{ id: Date.now().toString(), draft: nextDraft }, ...prev];
      });
      pushAssistantMessage(`Selected ${option}. I prepared the action — click \`Sign & Execute\` to proceed.`);
      setPendingConfirmation(null);
    },
    [
      applyPercentAmountToDraft,
      buildAddLiquidityDraftFromPair,
      buildAddLiquiditySizeSelection,
      buildAmountPercentSelection,
      buildPendingConfirmation,
      canonicalTokenSymbol,
      getSwapCounterpartOptions,
      getStakedAmountByToken,
      pendingConfirmation,
      pushAssistantMessage,
      toCleanAmount,
    ]
  );

  const handleCustomInputSubmit = useCallback(
    (value: string) => {
      if (!pendingConfirmation?.selectionField) return;
      const raw = value.trim();
      if (!raw) return;

      const numericMatches = raw.replace(/,/g, "").match(/(\d+(?:\.\d+)?)/g) || [];
      const firstNumber = numericMatches[0];

      // Helper: create amount draft for swap/stake/unstake
      const setAmountAndConfirm = (amountRaw: string) => {
        const amount = toCleanAmount(Number(amountRaw));
        const nextDraft: TransactionDraft = {
          ...pendingConfirmation.draft,
          params: {
            ...pendingConfirmation.draft.params,
            amount,
          },
        };
        setPendingConfirmation(buildPendingConfirmation(nextDraft));
      };

      if (pendingConfirmation.selectionField === "amount") {
        if (!firstNumber) {
          pushAssistantMessage("Please enter a numeric amount.");
          return;
        }
        if (pendingConfirmation.draft.intent === "swap") {
          setAmountAndConfirm(firstNumber);
          return;
        }
        if (pendingConfirmation.draft.intent === "stake" || pendingConfirmation.draft.intent === "unstake") {
          setAmountAndConfirm(firstNumber);
          return;
        }
      }

      if (pendingConfirmation.selectionField === "lpAmount") {
        if (pendingConfirmation.draft.intent === "removeLiquidity") {
          const lpInput = raw;
          const nextDraft: TransactionDraft = {
            ...pendingConfirmation.draft,
            params: {
              ...pendingConfirmation.draft.params,
              lpAmount: lpInput,
            },
          };
          setActions((prev) => {
            const incomingKey = draftKey(nextDraft);
            const exists = prev.some((a) => draftKey(a.draft) === incomingKey);
            if (exists) return prev;
            return [{ id: Date.now().toString(), draft: nextDraft }, ...prev];
          });
          pushAssistantMessage(`Prepared remove liquidity with ${lpInput}. Click \`Sign & Execute\` to proceed.`);
          setPendingConfirmation(null);
          return;
        }

        if (pendingConfirmation.draft.intent === "addLiquidity") {
          const token0 = pendingConfirmation.draft.params.token0 || "USDC";
          const token1 = pendingConfirmation.draft.params.token1 || "USDT";

          if (raw.includes("%")) {
            const pct = numericMatches.length ? Number(numericMatches[0]) : NaN;
            if (!Number.isFinite(pct) || pct <= 0) {
              pushAssistantMessage("LP amount percent must be a number > 0 (e.g. 50%).");
              return;
            }
            const sizedDraft = buildAddLiquidityDraftFromPair(token0, token1, pendingConfirmation.draft, pct);
            setPendingConfirmation(buildPendingConfirmation(sizedDraft));
            return;
          }

          if (numericMatches.length < 2) {
            pushAssistantMessage(`For add liquidity, enter both amounts like \`100,200\` (amount0,amount1) or a percent like \`50%\`.`);
            return;
          }
          const amount0 = toCleanAmount(Number(numericMatches[0]));
          const amount1 = toCleanAmount(Number(numericMatches[1]));
          const nextDraft: TransactionDraft = {
            ...pendingConfirmation.draft,
            params: {
              ...pendingConfirmation.draft.params,
              token0,
              token1,
              amount0,
              amount1,
            },
          };
          setPendingConfirmation(buildPendingConfirmation(nextDraft));
          return;
        }
      }
    },
    [
      pendingConfirmation,
      pushAssistantMessage,
      toCleanAmount,
      buildPendingConfirmation,
      buildAddLiquidityDraftFromPair,
      setActions,
    ]
  );

  const handleConfirmNo = useCallback(() => {
    setPendingConfirmation(null);
    pushAssistantMessage("Understood. I stopped that action.");
  }, [pushAssistantMessage]);

  const handleClose = useCallback((id: string) => {
    setActions((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const handleExecute = useCallback(
    async (id: string) => {
      if (!address) {
        toast.error("Connect your wallet first");
        return;
      }

      const action = actions.find((a) => a.id === id);
      if (!action) return;
      pushAssistantMessage(`Starting ${action.draft.intent.toUpperCase()} transaction. I will post live updates here...`);

      let targetChainId: number = polkadotHub.id;
      if (action.draft.intent === "bridge") {
        const fromChain = (action.draft.params.fromChain || "").toLowerCase();
        if (fromChain.includes("base")) {
          targetChainId = BASE_SEPOLIA_CHAIN_ID;
        } else if (fromChain.includes("polkadot") || fromChain.includes("hub")) {
          targetChainId = polkadotHub.id;
        } else if (chainId === BASE_SEPOLIA_CHAIN_ID || chainId === polkadotHub.id) {
          // If user is already on a bridge-supported source chain, keep it.
          targetChainId = chainId;
        } else {
          // Default bridge source chain if unknown.
          targetChainId = polkadotHub.id;
        }
      }

      if (chainId !== targetChainId) {
        try {
          const label = targetChainId === BASE_SEPOLIA_CHAIN_ID ? "Base Sepolia" : `${polkadotHub.name}`;
          pushAssistantMessage(`Switching network to ${label} before execution...`);
          await switchChainAsync({ chainId: targetChainId });
        } catch {
          const label = targetChainId === BASE_SEPOLIA_CHAIN_ID ? "Base Sepolia" : `${polkadotHub.name}`;
          pushAssistantMessage(`Network switch to ${label} was not completed. Transaction cancelled.`);
          toast.error(`Switch wallet network to ${label} (Chain ID ${targetChainId}) and try again.`);
          return;
        }
      }

      // Close immediately after click for cleaner UX.
      setActions((prev) => prev.filter((a) => a.id !== id));

      const result = await execute(action.draft);
      if (!result.success) {
        pushAssistantMessage(
          `Transaction failed for ${action.draft.intent.toUpperCase()}.${result.error ? `\nReason: ${result.error}` : ""}`
        );
        // Restore card so user can retry when tx fails/rejected.
        setActions((prev) => (prev.some((a) => a.id === action.id) ? prev : [action, ...prev]));
        return;
      }

      if (result.pending) {
        const txHashLabel = result.txHash ?? "N/A";
        const txExplorer = result.txHash
          ? result.chainId === BASE_SEPOLIA_CHAIN_ID
            ? `https://sepolia.basescan.org/tx/${result.txHash}`
            : `https://blockscout-passet-hub.parity-testnet.parity.io/tx/${result.txHash}`
          : "";
        pushAssistantMessage(
          `Bridge transaction submitted and still confirming.\nTx ID: ${txHashLabel}${txExplorer ? `\nExplorer: ${txExplorer}` : ""}\nBridge settlement may complete shortly after source confirmation.`
        );
        return;
      }

      // Save to transaction history with points
      await saveTransaction(action.draft, result.txHash, result.blockNumber);
      const txHashLabel = result.txHash ?? "N/A";
      const txExplorer = result.txHash
        ? result.chainId === BASE_SEPOLIA_CHAIN_ID
          ? `https://sepolia.basescan.org/tx/${result.txHash}`
          : `https://blockscout-passet-hub.parity-testnet.parity.io/tx/${result.txHash}`
        : "";
      const swapDetails = result.swap;
      const swapSummary =
        action.draft.intent === "swap" && swapDetails
          ? `\nSwapped ${swapDetails.amountIn} ${swapDetails.fromToken} for ~${swapDetails.amountOutEstimated} ${swapDetails.toToken}. (Estimated)`
          : "";
      pushAssistantMessage(
        `Transaction successful for ${action.draft.intent.toUpperCase()}.\nTx ID: ${txHashLabel}${txExplorer ? `\nExplorer: ${txExplorer}` : ""}${swapSummary}`
      );
    },
    [address, chainId, switchChainAsync, actions, execute, saveTransaction, pushAssistantMessage]
  );

  const handleTabNavigate = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const handleSelectConversation = useCallback(
    (conversationId: string) => {
      const thread = conversations.find((c) => c.id === conversationId);
      if (!thread) return;
      setActiveConversationId(conversationId);
      setMessages(thread.messages || []);
      setActions(thread.actions || []);
      setPendingConfirmation(null);
      setActiveTab("home");
    },
    [conversations]
  );

  const renderContent = () => {
    switch (activeTab) {
      case "profile":
        return <ProfilePanel />;
      case "portfolio":
        return <PortfolioDashboard />;
      case "history":
        return <HistoryPanel />;
      case "points":
        return <PointsPanel />;
      case "roadmap":
        return <RoadmapPanel />;
      case "about":
        return <AboutPanel />;
      case "admin":
        return <AdminPanel />;
      default:
        return (
          <>
            {/* Chat conversation with message history */}
            <div className="w-full max-w-[800px] mb-4">
              <ChatConversation
                messages={messages}
                isProcessing={isProcessing}
                pendingConfirmation={
                  pendingConfirmation
                    ? {
                        id: pendingConfirmation.id,
                        prompt: pendingConfirmation.prompt,
                        options: pendingConfirmation.options,
                        customInput: pendingConfirmation.customInput,
                      }
                    : null
                }
                onConfirmYes={handleConfirmYes}
                onConfirmNo={handleConfirmNo}
                onSelectOption={handleSelectOption}
                onCustomInputSubmit={handleCustomInputSubmit}
                emptyPlaceholder={
                  <div className="text-center space-y-4 px-4">
                    <img
                      src="/rosepolka.png"
                      alt="Rose PolkaAi"
                      width={96}
                      height={96}
                      className="mx-auto rounded-2xl object-cover shadow-lg border border-white/10"
                    />
                    <h1 className="text-3xl sm:text-4xl font-medium text-[#f5f5f7] tracking-tight">
                      Rose PolkaAi — your AI DeFi copilot for Polkadot Hub
                    </h1>
                    <p className="text-sm text-white/65 max-w-xl mx-auto">
                      Swap, bridge, stake, lend, mint NFTs, check portfolio balances, and ask crypto/finance questions in one place.
                    </p>
                  </div>
                }
              />
            </div>

            {/* Command bar below chat */}
            <div className="w-full max-w-[800px] mb-4 sm:mb-6">
              <CommandBar onCommand={handleCommand} isProcessing={isProcessing} />
            </div>

            {/* Action stack */}
            <div className="w-full max-w-[800px] space-y-3">
              <AnimatePresence mode="popLayout">
                {actions.map((action) => (
                  <div key={action.id}>
                    <ActionCard
                      draft={action.draft}
                      onClose={() => handleClose(action.id)}
                      onExecute={() => handleExecute(action.id)}
                    />
                  </div>
                ))}
              </AnimatePresence>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#050508] text-[#f5f5f7] lg:flex">
      <aside className="hidden lg:flex w-[260px] border-r border-white/10 bg-[#08080d] flex-col p-3">
        <button
          onClick={() => {
            handleNewChat();
            setActiveTab("home");
          }}
          className="w-full flex items-center gap-2 rounded-xl border border-white/10 bg-[#12121a] px-3 py-2 text-sm font-medium text-white hover:bg-[#181822] transition-colors"
        >
          <MessageSquarePlus className="w-4 h-4" />
          New chat
        </button>

        <div className="mt-5 pt-4 border-t border-white/10 space-y-1">
          {SIDEBAR_TABS.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => handleTabNavigate(tab.id)}
                className={`w-full flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? "bg-[#151520] text-white" : "text-white/70 hover:bg-[#12121a]"
                }`}
              >
                <tab.icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="mt-5 pt-4 border-t border-white/10 flex-1 min-h-0 flex flex-col">
          <p className="px-3 pb-2 text-xs uppercase tracking-wide text-white/45">Your chats</p>
          <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin">
            <div className="space-y-1">
              {visibleConversations.length === 0 ? (
                <p className="px-3 py-2 text-sm text-white/45">No chats yet</p>
              ) : (
                visibleConversations.map((thread) => {
                  const active = activeConversationId === thread.id;
                  return (
                    <button
                      key={thread.id}
                      onClick={() => handleSelectConversation(thread.id)}
                      className={`w-full text-left rounded-lg px-3 py-2 text-sm transition-colors ${
                        active ? "bg-[#151520] text-white" : "text-white/70 hover:bg-[#12121a]"
                      }`}
                      title={thread.title}
                    >
                      <span className="block truncate">{thread.title || "New chat"}</span>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-h-screen">
        <div className="lg:hidden">
          <TopBar activeTab={activeTab} onNavigate={handleTabNavigate} />
        </div>

        <header className="hidden lg:flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#050508]">
          <div className="flex items-center gap-3">
            <img src="/rosepolka.png" alt="" width={36} height={36} className="rounded-xl object-cover" />
            <span className="text-base font-medium">Rose PolkaAi</span>
          </div>
          <WalletButton />
        </header>

        <div className="flex-1 flex flex-col items-center px-4 sm:px-6 py-4 sm:py-6 overflow-y-auto scrollbar-thin pb-20 lg:pb-6">
          {renderContent()}
        </div>
      </div>

      <BottomNav active={activeTab} onNavigate={handleTabNavigate} />
    </div>
  );
}
