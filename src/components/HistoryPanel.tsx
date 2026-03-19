import { useAccount } from "wagmi";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { ArrowRightLeft, Coins, Landmark, Palette, Rocket, Search, ArrowDownUp, Globe, ExternalLink, Loader2 } from "lucide-react";
import type { IntentType } from "./ActionCard";

const INTENT_ICONS: Record<string, React.ElementType> = {
  swap: ArrowRightLeft,
  bridge: Globe,
  stake: Coins,
  unstake: ArrowDownUp,
  lend: Landmark,
  mint: Palette,
  launchpad: Rocket,
  research: Search,
};

const STATUS_COLORS: Record<string, string> = {
  finalized: "text-success",
  pending: "text-warning",
  failed: "text-destructive",
};

function shortenHash(hash: string): string {
  return `${hash.slice(0, 6)}…${hash.slice(-4)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

export default function HistoryPanel() {
  const { address } = useAccount();
  const { transactions, isLoading } = useTransactionHistory(address);

  if (!address) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <p className="text-sm text-white/60">Connect your wallet to view transaction history</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-white/50" />
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-[#171722] flex items-center justify-center mb-3">
          <Search className="w-6 h-6 text-white/50" />
        </div>
        <p className="text-sm text-white/60">No transactions yet. Start commanding!</p>
      </div>
    );
  }

  return (
    <div className="flex-1 p-4 max-w-[800px] mx-auto w-full space-y-2">
      <h2 className="text-sm font-semibold text-white mb-3">Transaction History</h2>
      {transactions.map((tx) => {
        const Icon = INTENT_ICONS[tx.intent] || Search;
        return (
          <div key={tx.id} className="rounded-xl border border-white/10 bg-[#0f0f15] p-3 flex items-center gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <div className="w-8 h-8 rounded-lg bg-[#171722] flex items-center justify-center shrink-0">
              <Icon className="w-4 h-4 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-white truncate">{tx.summary}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className={`text-[10px] font-mono ${STATUS_COLORS[tx.status] || "text-white/55"}`}>
                  {tx.status}
                </span>
                <span className="text-[10px] text-white/55">{formatDate(tx.created_at)}</span>
                {tx.platform_fee && (
                  <span className="text-[10px] text-white/55">Fee: {tx.platform_fee}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-[10px] font-mono text-white bg-white/10 px-1.5 py-0.5 rounded">
                +{tx.points_earned} pts
              </span>
              {tx.tx_hash && (
                <a
                  href={`https://blockscout-passet-hub.parity-testnet.parity.io/tx/${tx.tx_hash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white/45 hover:text-white/80 transition-colors"
                  title={tx.tx_hash}
                >
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
