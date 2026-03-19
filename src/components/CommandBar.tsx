import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, ArrowRight, Zap } from "lucide-react";

const SUGGESTIONS = [
  "Swap 100 USDC to USDT",
  "Swap 500 USDT for USDC",
  "Swap 25 USDT to TCC",
  "Swap 25 USDC to DOMAIN",
  "Add liquidity 100 USDC and 100 USDT",
  "Remove liquidity 10 LP",
  "Bridge 100 USDC from Polkadot Hub to Base",
  "Bridge 0.05 ETH from Base to Polkadot Hub",
  "Stake 500 USDC",
  "Unstake 200 USDC",
  "Lend 2000 USDC on Hub",
  "Unlend 500 USDC",
  "Claim 200 USDC",
  "Buy 10 $TCC with USDC",
  "Check my assets balance",
  "View my points and rank",
  "Mint NFT from PolkaPunks",
  "Launch ERC-20 token MyToken",
  "Research Polkadot Hub ecosystem",
];

interface CommandBarProps {
  onCommand: (command: string) => void;
  isProcessing: boolean;
}

export default function CommandBar({ onCommand, isProcessing }: CommandBarProps) {
  const [value, setValue] = useState("");
  const [isFocused, setIsFocused] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  useEffect(() => {
    if (value.length > 0) {
      setFilteredSuggestions(
        SUGGESTIONS.filter((s) => s.toLowerCase().includes(value.toLowerCase())).slice(0, 5)
      );
    } else {
      setFilteredSuggestions([]);
    }
  }, [value]);

  // Ensure focus overlay never sticks while a command is processing.
  useEffect(() => {
    if (!isProcessing) return;
    setIsFocused(false);
    inputRef.current?.blur();
  }, [isProcessing]);

  const detectIntent = useCallback((text: string) => {
    const lower = text.toLowerCase();
    const hasLiquidityWord = /\b(lp|liquidity|liq[a-z]*)\b/i.test(lower);
    const isRemoveLiquidity = hasLiquidityWord && /\b(remove|withdraw|exit)\b/i.test(lower);
    const isAddLiquidity =
      hasLiquidityWord &&
      (/\b(add|provide|deposit)\b/i.test(lower) || /\bpair\b|\/|paired|equivalent|pool\b/i.test(lower));

    if (lower.includes("unlend") || (lower.includes("withdraw") && lower.includes("lend"))) return "unlend";
    if (isRemoveLiquidity) return "removeLiquidity";
    if (isAddLiquidity) return "addLiquidity";
    if (lower.includes("swap") || lower.includes("exchange")) return "swap";
    if (lower.includes("bridge") || lower.includes("cross-chain")) return "bridge";
    if (lower.includes("lend") || lower.includes("supply")) return "lend";
    if (lower.includes("unstake")) return "unstake";
    if (lower.includes("stake")) return "stake";
    if (lower.includes("mint") || lower.includes("nft")) return "mint";
    if (lower.includes("claim") || lower.includes("faucet")) return "claim";
    if (lower.includes("launch") || lower.includes("deploy")) return "launchpad";
    if (lower.includes("point") || lower.includes("rank") || lower.includes("leaderboard")) return "points";
    if (lower.includes("research")) return "research";
    return null;
  }, []);

  const intent = detectIntent(value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (value.trim() && !isProcessing) {
      onCommand(value.trim());
      setValue("");
      setIsFocused(false);
      inputRef.current?.blur();
    }
  };

  return (
    <div className="relative w-full max-w-[800px] mx-auto">
      <AnimatePresence>
        {isFocused && filteredSuggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
            onClick={() => {
              setIsFocused(false);
              inputRef.current?.blur();
            }}
          />
        )}
      </AnimatePresence>

      <form onSubmit={handleSubmit} className="relative z-50">
        <motion.div
          className={`flex items-center gap-3 px-4 py-3 rounded-full border border-white/10 bg-[#0f0f15] shadow-sm transition-all duration-200 ${
            isFocused ? "ring-2 ring-primary/40" : ""
          }`}
          animate={isFocused ? { scale: 1.01 } : { scale: 1 }}
          transition={{ type: "tween", ease: [0.2, 0, 0, 1], duration: 0.2 }}
        >
          {isProcessing ? (
            <Zap className="w-4 h-4 text-primary animate-pulse" />
          ) : (
            <Search className="w-4 h-4 text-white/60" />
          )}
          <input
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            placeholder="Ask anything"
            className="flex-1 bg-transparent text-[#f5f5f7] text-sm placeholder:text-white/35 outline-none"
            disabled={isProcessing}
          />
          {intent && (
            <span className="text-xs font-mono text-white/70 px-2 py-0.5 rounded bg-white/10">
              {intent}
            </span>
          )}
          {value && (
            <button type="submit" className="text-white/55 hover:text-white transition-colors">
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
          {!value && (
            <kbd className="hidden sm:inline text-[10px] font-mono text-white/55 bg-white/10 px-1.5 py-0.5 rounded">
              ⌘K
            </kbd>
          )}
        </motion.div>

        <AnimatePresence>
          {isFocused && filteredSuggestions.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ type: "tween", ease: [0.2, 0, 0, 1], duration: 0.15 }}
              className="absolute top-full mt-2 w-full rounded-2xl border border-white/10 bg-[#12121a] shadow-lg z-50 py-1 overflow-hidden"
            >
              {filteredSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="w-full text-left px-4 py-2 text-sm text-white/75 hover:text-white hover:bg-white/10 transition-colors"
                  onMouseDown={() => {
                    setValue(suggestion);
                    onCommand(suggestion);
                    setValue("");
                    setIsFocused(false);
                    inputRef.current?.blur();
                  }}
                >
                  <span className="text-white/45 mr-2">→</span>
                  {suggestion}
                </button>
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}
