import { motion, AnimatePresence } from "framer-motion";
import { Check, Loader2, ExternalLink, XCircle } from "lucide-react";
import type { ExecutionStep } from "@/hooks/useContractExecution";

interface ExecutionFeedbackProps {
  step: ExecutionStep;
  txHash: string | null;
  blockNumber: bigint | null;
  error: string | null;
  onDismiss: () => void;
}

const STEP_LABELS: Record<ExecutionStep, string> = {
  idle: "",
  approving: "Approving token spend...",
  simulating: "Simulating transaction...",
  "awaiting-signature": "Awaiting wallet signature...",
  broadcasting: "Broadcasting to Polkadot Hub...",
  confirming: "Waiting for confirmation...",
  finalized: "Finalized ✓",
  error: "Transaction failed",
};

const STEP_ORDER: ExecutionStep[] = [
  "approving",
  "simulating",
  "awaiting-signature",
  "broadcasting",
  "finalized",
];

export default function ExecutionFeedback({ step, txHash, blockNumber, error, onDismiss }: ExecutionFeedbackProps) {
  if (step === "idle") return null;

  const currentIndex = STEP_ORDER.indexOf(step);
  const isError = step === "error";
  const isFinalized = step === "finalized";
  const progress = isFinalized ? 100 : isError ? 0 : ((currentIndex + 1) / STEP_ORDER.length) * 100;

  const explorerUrl = txHash
    ? `https://blockscout-passet-hub.parity-testnet.parity.io/tx/${txHash}`
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="surface-elevated p-4"
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Transaction Execution</h3>
          {isFinalized && explorerUrl && (
            <a
              href={explorerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-primary flex items-center gap-1 hover:underline"
            >
              View on Subscan <ExternalLink className="w-2.5 h-2.5" />
            </a>
          )}
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-secondary rounded-full mb-3 overflow-hidden">
          <motion.div
            className={`h-full rounded-full ${isError ? "bg-destructive" : "bg-primary"}`}
            initial={{ width: "0%" }}
            animate={{ width: `${progress}%` }}
            transition={{ ease: [0.2, 0, 0, 1], duration: 0.3 }}
          />
        </div>

        <div className="space-y-1.5">
          {STEP_ORDER.map((s, i) => {
            const isDone = currentIndex > i || isFinalized;
            const isCurrent = s === step;
            const isFuture = !isDone && !isCurrent;

            return (
              <div
                key={s}
                className={`flex items-center gap-2 text-xs transition-all duration-200 ${
                  isDone ? "text-muted-foreground" :
                  isCurrent ? "text-foreground" :
                  "text-muted-foreground/30"
                }`}
              >
                {isDone ? (
                  <Check className="w-3 h-3 text-success shrink-0" />
                ) : isCurrent ? (
                  <Loader2 className="w-3 h-3 text-primary animate-spin shrink-0" />
                ) : (
                  <div className="w-3 h-3 rounded-full border border-border shrink-0" />
                )}
                <span className="font-mono text-[11px]">{STEP_LABELS[s]}</span>
              </div>
            );
          })}
        </div>

        {isFinalized && txHash && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 p-2 bg-success/10 rounded-lg border border-success/20"
          >
            <p className="text-[10px] font-mono text-success">
              Tx: {txHash.slice(0, 10)}...{txHash.slice(-8)}
              {blockNumber ? ` • Block #${blockNumber.toString()}` : ""}
            </p>
          </motion.div>
        )}

        {isError && error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-3 p-2 bg-destructive/10 rounded-lg border border-destructive/20 flex items-start gap-2"
          >
            <XCircle className="w-3 h-3 text-destructive mt-0.5 shrink-0" />
            <p className="text-[10px] font-mono text-destructive">{error}</p>
          </motion.div>
        )}

        {(isFinalized || isError) && (
          <button
            onClick={onDismiss}
            className="mt-3 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
          >
            Dismiss
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
