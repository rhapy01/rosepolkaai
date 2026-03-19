import { motion } from "framer-motion";
import { ArrowRightLeft, Landmark, Coins, ArrowDownUp, Palette, Rocket, Search, X, AlertTriangle, Globe, Star, Trophy, Gift } from "lucide-react";
import { Button } from "@/components/ui/button";

export type IntentType =
  | "swap"
  | "bridge"
  | "lend"
  | "unlend"
  | "stake"
  | "unstake"
  | "mint"
  | "launchpad"
  | "points"
  | "chat"
  | "research"
  | "claim";

export interface AIParams {
  amount?: string;
  fromToken?: string;
  toToken?: string;
  token?: string;
  estimatedOutput?: string;
  exchangeRate?: string;
  route?: string;
  slippage?: string;
  protocol?: string;
  apy?: string;
  collateralFactor?: string;
  riskLevel?: string;
  validator?: string;
  eraReward?: string;
  unbondingPeriod?: string;
  estimatedCompletion?: string;
  collection?: string;
  chain?: string;
  uri?: string;
  mintPrice?: string;
  mintPriceToken?: string;
  totalSupply?: string;
  minted?: string;
  rarity?: string;
  tokenName?: string;
  tokenSymbol?: string;
  platform?: string;
  standard?: string;
  initialLiquidity?: string;
  burnEnabled?: string;
  burnMechanism?: string;
  tradingTaxBps?: string;
  taxRecipient?: string;
  taxBurnBps?: string;
  owner?: string;
  initialRecipient?: string;
  project?: string;
  tvl?: string;
  githubActivity?: string;
  sentiment?: string;
  keyMetrics?: string;
  fromChain?: string;
  toChain?: string;
  bridgeProtocol?: string;
  estimatedTime?: string;
  bridgeFee?: string;
  action?: string;
  platformFee?: string;
}

export interface TransactionDraft {
  intent: IntentType;
  summary: string;
  params: AIParams;
  gasEstimate: string;
  message: string;
  warnings?: string[];
}

interface ActionCardProps {
  draft: TransactionDraft;
  onClose: () => void;
  onExecute: () => void;
}

const INTENT_CONFIG: Record<IntentType, { icon: React.ElementType; title: string; color: string }> = {
  swap: { icon: ArrowRightLeft, title: "Token Swap", color: "text-primary" },
  bridge: { icon: Globe, title: "Cross-Chain Bridge", color: "text-primary" },
  lend: { icon: Landmark, title: "Lending Position", color: "text-success" },
  unlend: { icon: ArrowDownUp, title: "Lending Withdraw", color: "text-warning" },
  stake: { icon: Coins, title: "Staking", color: "text-primary" },
  unstake: { icon: ArrowDownUp, title: "Unstaking", color: "text-warning" },
  mint: { icon: Palette, title: "NFT Mint", color: "text-primary" },
  launchpad: { icon: Rocket, title: "Token Launchpad", color: "text-primary" },
  points: { icon: Trophy, title: "Points & Rank", color: "text-primary" },
  chat: { icon: Search, title: "AI Response", color: "text-muted-foreground" },
  research: { icon: Search, title: "Research", color: "text-muted-foreground" },
  claim: { icon: Gift, title: "Token Claim", color: "text-success" },
};

const NON_EXECUTABLE_INTENTS: IntentType[] = ["research", "points", "chat"];

function DataRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className="flex justify-between text-xs">
      <span className="text-white/55">{label}</span>
      <span className="font-mono text-white">{value}</span>
    </div>
  );
}

function SwapDetails({ p }: { p: AIParams }) {
  const feeAmount = p.amount ? (parseFloat(p.amount) * 0.001).toFixed(6) : "0";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">From</p>
          <p className="text-lg font-semibold text-white">{p.amount} {p.fromToken}</p>
        </div>
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">To (est.)</p>
          <p className="text-lg font-semibold text-white">{p.estimatedOutput} {p.toToken}</p>
        </div>
      </div>
      <DataRow label="Rate" value={p.exchangeRate} />
      <DataRow label="Route" value={p.route} />
      <DataRow label="Slippage" value={p.slippage} />
      <DataRow label="Protocol" value={p.protocol} />
      <DataRow label="Platform Fee (0.1%)" value={`${feeAmount} ${p.fromToken || ""}`} />
    </div>
  );
}

function BridgeDetails({ p }: { p: AIParams }) {
  const feeAmount = p.amount ? (parseFloat(p.amount) * 0.001).toFixed(6) : "0";
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">From</p>
          <p className="text-lg font-semibold text-white">{p.amount} {p.token}</p>
          <p className="text-[10px] text-white/55">{p.fromChain}</p>
        </div>
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">To</p>
          <p className="text-lg font-semibold text-white">{p.toChain}</p>
          <p className="text-[10px] text-white/55">{p.estimatedTime}</p>
        </div>
      </div>
      <DataRow label="Bridge" value={p.bridgeProtocol} />
      <DataRow label="Bridge Fee" value={p.bridgeFee} />
      <DataRow label="Platform Fee (0.1%)" value={`${feeAmount} ${p.token || ""}`} />
    </div>
  );
}

function LendDetails({ p, isUnlend = false }: { p: AIParams; isUnlend?: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">{isUnlend ? "Withdraw" : "Supply"}</p>
          <p className="text-lg font-semibold text-white">{p.amount} {p.token}</p>
        </div>
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">APY</p>
          <p className="text-lg font-semibold text-success">{p.apy}</p>
        </div>
      </div>
      <DataRow label="Protocol" value={p.protocol} />
      <DataRow label="Collateral Factor" value={p.collateralFactor} />
      <DataRow label="Risk" value={p.riskLevel} />
      {isUnlend && <DataRow label="Est. Completion" value={p.estimatedCompletion} />}
    </div>
  );
}

function StakeDetails({ p, isUnstake }: { p: AIParams; isUnstake: boolean }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">{isUnstake ? "Unstake" : "Stake"}</p>
          <p className="text-lg font-semibold text-white">{p.amount} {p.token}</p>
        </div>
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">{isUnstake ? "Unbonding" : "APY"}</p>
          <p className="text-lg font-semibold text-white">{isUnstake ? p.unbondingPeriod : p.apy}</p>
        </div>
      </div>
      <DataRow label="Validator" value={p.validator} />
      <DataRow label="Era Reward" value={p.eraReward} />
      {isUnstake && <DataRow label="Est. Completion" value={p.estimatedCompletion} />}
    </div>
  );
}

function MintDetails({ p }: { p: AIParams }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">Collection</p>
          <p className="text-lg font-semibold text-white">{p.collection}</p>
        </div>
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">Chain</p>
          <p className="text-lg font-semibold text-white">{p.chain || "Hub"}</p>
        </div>
      </div>
      <DataRow label="Mint Price" value={p.mintPrice ? `${p.mintPrice} ${p.mintPriceToken || "DOT"}` : undefined} />
      <DataRow label="Supply" value={p.minted && p.totalSupply ? `${p.minted} / ${p.totalSupply}` : undefined} />
      <DataRow label="Rarity" value={p.rarity} />
    </div>
  );
}

function LaunchDetails({ p }: { p: AIParams }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">Token</p>
          <p className="text-lg font-semibold text-white">{p.tokenName || p.tokenSymbol}</p>
        </div>
        <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
          <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">Platform</p>
          <p className="text-lg font-semibold text-white">{p.platform}</p>
        </div>
      </div>
      <DataRow label="Standard" value={p.standard} />
      <DataRow label="Total Supply" value={p.totalSupply} />
      <DataRow label="Initial Liquidity" value={p.initialLiquidity} />
      <DataRow label="Burn Enabled" value={p.burnEnabled || p.burnMechanism} />
      <DataRow label="Trading Tax" value={p.tradingTaxBps ? `${p.tradingTaxBps} bps` : undefined} />
      <DataRow label="Tax Recipient" value={p.taxRecipient} />
      <DataRow label="Tax Burn Share" value={p.taxBurnBps ? `${p.taxBurnBps} bps of tax` : undefined} />
      <DataRow label="Token Owner" value={p.owner} />
    </div>
  );
}

function PointsDetails({ p }: { p: AIParams }) {
  return (
    <div className="space-y-3">
      <div className="bg-[#171722] border border-white/10 rounded-lg p-3 text-center">
        <Star className="w-6 h-6 text-primary mx-auto mb-2" />
        <p className="text-sm text-white/65">Check your Points & Rank in the Points tab</p>
      </div>
    </div>
  );
}

function ResearchDetails({ p }: { p: AIParams }) {
  return (
    <div className="space-y-3">
      <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
        <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">Project</p>
        <p className="text-lg font-semibold text-white">{p.project}</p>
      </div>
      <DataRow label="TVL" value={p.tvl} />
      <DataRow label="GitHub Activity" value={p.githubActivity} />
      <DataRow label="Sentiment" value={p.sentiment} />
      <DataRow label="Key Metrics" value={p.keyMetrics} />
    </div>
  );
}

function ClaimDetails({ p }: { p: AIParams }) {
  return (
    <div className="space-y-3">
      <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
        <p className="text-[10px] text-white/55 uppercase tracking-wide mb-1">Claim Amount</p>
        <p className="text-lg font-semibold text-white">{p.amount} {p.token}</p>
      </div>
      <DataRow label="Source" value={p.protocol || "DeFAI Demo Faucet"} />
      <DataRow label="Action" value="Mint test tokens to connected wallet" />
    </div>
  );
}

export default function ActionCard({ draft, onClose, onExecute }: ActionCardProps) {
  const config = INTENT_CONFIG[draft.intent] || INTENT_CONFIG.research;
  const Icon = config.icon;
  const isExecutable = !NON_EXECUTABLE_INTENTS.includes(draft.intent);
  const hiddenMessageSet = new Set([
    "Prepared from your unstructured prompt.",
    "Prepared from your prompt.",
  ]);
  const showMessage = Boolean(draft.message && !hiddenMessageSet.has(draft.message.trim()));

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "tween", ease: [0.2, 0, 0, 1], duration: 0.2 }}
      className="overflow-hidden rounded-2xl border border-white/10 bg-[#0f0f15] shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${config.color}`} />
          <h3 className="text-sm font-semibold text-white">{config.title}</h3>
        </div>
        <button onClick={onClose} className="text-white/45 hover:text-white/85 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* AI Summary */}
      <div className="px-4 pt-3 pb-1">
        <p className="text-xs text-white/65 italic">{draft.summary}</p>
      </div>

      {/* Body */}
      <div className="p-4">
        {draft.intent === "swap" && <SwapDetails p={draft.params} />}
        {draft.intent === "bridge" && <BridgeDetails p={draft.params} />}
        {draft.intent === "lend" && <LendDetails p={draft.params} />}
        {draft.intent === "unlend" && <LendDetails p={draft.params} isUnlend />}
        {draft.intent === "stake" && <StakeDetails p={draft.params} isUnstake={false} />}
        {draft.intent === "unstake" && <StakeDetails p={draft.params} isUnstake={true} />}
        {draft.intent === "mint" && <MintDetails p={draft.params} />}
        {draft.intent === "launchpad" && <LaunchDetails p={draft.params} />}
        {draft.intent === "points" && <PointsDetails p={draft.params} />}
        {draft.intent === "research" && <ResearchDetails p={draft.params} />}
        {draft.intent === "claim" && <ClaimDetails p={draft.params} />}
      </div>

      {/* AI Message */}
      {showMessage && (
        <div className="px-4 pb-3">
          <p className="text-[11px] text-white/70 bg-[#171722] border border-white/10 rounded-lg px-3 py-2">
            🤖 {draft.message}
          </p>
        </div>
      )}

      {/* Warnings */}
      {draft.warnings && draft.warnings.length > 0 && (
        <div className="px-4 pb-3 space-y-1">
          {draft.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-warning bg-warning/10 rounded-lg px-3 py-2">
              <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
              {w}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-white/10 bg-[#13131a]">
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-mono text-white/60">
            Gas: ~{draft.gasEstimate}
          </span>
          {isExecutable && (
            <span className="text-[10px] font-mono text-primary">
              +100 pts
            </span>
          )}
        </div>
        {isExecutable && (
          <Button variant="execute" size="sm" onClick={onExecute}>
            Sign & Execute
          </Button>
        )}
      </div>
    </motion.div>
  );
}
