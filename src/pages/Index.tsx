import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAccount, useSwitchChain } from "wagmi";
import { MessageSquarePlus, House, LayoutDashboard, Clock3, Trophy, User, Shield, Map, Info } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useContractExecution, type ExecutionStep } from "@/hooks/useContractExecution";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { usePortfolioBalances } from "@/hooks/usePortfolioBalances";
import { polkadotHub } from "@/lib/wagmi-config";
import { BASE_SEPOLIA_CHAIN_ID } from "@/lib/contracts";
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

interface ActiveAction {
  id: string;
  draft: TransactionDraft;
}

interface PendingConfirmation {
  id: string;
  draft: TransactionDraft;
  prompt: string;
  options?: string[];
  selectionField?: "toToken" | "token";
}

interface ConversationThread {
  id: string;
  title: string;
  messages: ChatMessage[];
  actions: ActiveAction[];
  createdAt: number;
  updatedAt: number;
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD";

function draftKey(draft: TransactionDraft) {
  return `${draft.intent}:${draft.params?.protocol ?? ""}:${JSON.stringify(draft.params ?? {})}`;
}

const SIDEBAR_TABS = [
  { id: "home", label: "Home", icon: House },
  { id: "about", label: "About", icon: Info },
  { id: "portfolio", label: "Portfolio", icon: LayoutDashboard },
  { id: "history", label: "History", icon: Clock3 },
  { id: "points", label: "Points", icon: Trophy },
  { id: "roadmap", label: "Roadmap", icon: Map },
  { id: "profile", label: "Profile", icon: User },
  { id: "admin", label: "Admin", icon: Shield },
] as const;

const EXECUTABLE_INTENTS = new Set([
  "swap",
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

  const { saveTransaction } = useTransactionHistory(address);
  const { balances, isLoading: balancesLoading, error: balancesError } = usePortfolioBalances(address as any);
  const visibleConversations = useMemo(
    () =>
      conversations
        .filter((thread) => (thread.messages?.length ?? 0) > 0 || (thread.actions?.length ?? 0) > 0)
        .sort((a, b) => b.updatedAt - a.updatedAt),
    [conversations]
  );

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

  const buildPendingConfirmation = useCallback(
    (draft: TransactionDraft): PendingConfirmation => {
      const p = draft.params ?? {};
      let prompt = `I understood this action: ${draft.summary}. Proceed?`;
      if (draft.intent === "swap") {
        prompt = `You want to swap ${p.amount || "0"} ${p.fromToken || "USDC"} to ${p.toToken || "USDT"}. Proceed?`;
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
      const launchTokenRequested =
        /\b(create|deploy|launch)\b[\w\s]{0,20}\btoken\b/i.test(command) ||
        /\btoken\s*(name|ticker|symbol)\b/i.test(command) ||
        /\btotal\s+supply\b/i.test(lower) ||
        /\bbuy\s+and\s+sell\s+tax\b/i.test(lower);
      const tokenMatch = lower.match(/\$?(usdc|usdt|dot|eth|domain|tcc|tcx|tch|pai|hlt|rwa|yield|infra|carb)\b/i);
      const token = (tokenMatch?.[1] || "USDC").toUpperCase();
      const pctMatch = lower.match(/(\d+(?:\.\d+)?)\s*%/);
      const amountMatch = lower.match(/(\d+(?:\.\d+)?)/);
      const tokenBalance = balances.find((b) => b.symbol.toUpperCase() === token);
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
        const fromBal = balances.find((b) => b.symbol.toUpperCase() === fromToken);
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
          params: { amount, fromToken, toToken, protocol: "DeFAISimpleSwap", slippage: "0.5%" },
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
    [address, balances, toCleanAmount, buildPendingConfirmation, buildTickerDisambiguation]
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

    const isSimpleCommand = (() => {
      const t = command.trim();
      const lower = t.toLowerCase();
      if (t.length === 0) return false;
      // If user is clearly asking multi-step or giving context, prefer AI.
      if (/\b(and then|then|after that|also|because|so that)\b/i.test(lower)) return false;
      if (/\bi have\b|\bmy (wallet|balance)\b|\buse (half|50%)\b/i.test(lower)) return false;

      // Fast-path simple action phrases.
      const simpleIntentHit =
        /\bbridge\b/i.test(lower) ||
        /\bstake\b/i.test(lower) ||
        /\bunstake\b/i.test(lower) ||
        /\bclaim\b/i.test(lower) ||
        /\bnft\b|\bmint\b/i.test(lower) ||
        /\bswap\b|\bexchange\b|\bswa[\w\[\]]*\b/i.test(lower) ||
        (/\b(create|deploy|launch)\b/i.test(lower) && /\btoken\b/i.test(lower));

      return simpleIntentHit && t.length <= 160;
    })();

    if (isSimpleCommand) {
      const unstructuredDraft = buildUnstructuredDraft(command);
      if (unstructuredDraft) {
        setPendingConfirmation(unstructuredDraft);
        return;
      }
    }

    setIsProcessing(true);

    try {
      const history = messages
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));
      const { data, error } = await supabase.functions.invoke("defai-agent", {
        body: { command, history },
      });

      if (error) {
        console.error("Edge function error:", error);
        // Fallback: if AI fails, try local parser for simple intents.
        const fallbackDraft = buildUnstructuredDraft(command);
        if (fallbackDraft) {
          setPendingConfirmation(fallbackDraft);
        } else {
          const errContent = "Failed to process command. Please try again.";
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
    formatBalancesMessage,
    pushAssistantMessage,
    buildUnstructuredDraft,
    buildPendingConfirmation,
    buildTickerDisambiguation,
    messages,
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
    (option: string) => {
      if (!pendingConfirmation?.selectionField) return;
      const nextDraft: TransactionDraft = {
        ...pendingConfirmation.draft,
        params: {
          ...pendingConfirmation.draft.params,
          [pendingConfirmation.selectionField]: option,
        },
      };
      setActions((prev) => {
        const incomingKey = draftKey(nextDraft);
        const exists = prev.some((a) => draftKey(a.draft) === incomingKey);
        if (exists) return prev;
        return [{ id: Date.now().toString(), draft: nextDraft }, ...prev];
      });
      pushAssistantMessage(`Selected ${option}. I prepared the action — click \`Sign & Execute\` to proceed.`);
      setPendingConfirmation(null);
    },
    [pendingConfirmation, pushAssistantMessage]
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
      pushAssistantMessage(
        `Transaction successful for ${action.draft.intent.toUpperCase()}.\nTx ID: ${txHashLabel}${txExplorer ? `\nExplorer: ${txExplorer}` : ""}`
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
                      }
                    : null
                }
                onConfirmYes={handleConfirmYes}
                onConfirmNo={handleConfirmNo}
                onSelectOption={handleSelectOption}
                emptyPlaceholder={
                  <div className="text-center space-y-4 px-4">
                    <h1 className="text-3xl sm:text-4xl font-medium text-[#f5f5f7] tracking-tight">
                      RosePolkaAi — your AI DeFi copilot for Polkadot Hub
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
          <div className="text-base font-medium">DeFAI Assistant</div>
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
