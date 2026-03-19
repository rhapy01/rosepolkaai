import { BookOpen, ShieldCheck, Sparkles } from "lucide-react";

export default function AboutPanel() {
  return (
    <div className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              About RosePolkaAi
            </h2>
            <p className="mt-2 text-sm text-white/65 max-w-3xl">
              RosePolkaAi is a chat-first DeFi assistant for Polkadot Hub. You type what you want to do in plain
              language, review a structured confirmation, then sign and execute on-chain.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full border border-primary/35 bg-primary/15 text-primary">
            MVP
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-white/10 bg-[#171722] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <BookOpen className="w-5 h-5 text-primary mb-2" />
          <h3 className="text-sm font-semibold text-white mb-1">What it does</h3>
          <p className="text-xs text-white/65 leading-relaxed">
            Swap, bridge, stake, mint NFTs, deploy demo tokens, and check portfolio balances using a single chat
            interface with confirmations and transaction status updates.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#171722] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <ShieldCheck className="w-5 h-5 text-primary mb-2" />
          <h3 className="text-sm font-semibold text-white mb-1">Safety model</h3>
          <p className="text-xs text-white/65 leading-relaxed">
            The assistant can suggest and prepare actions, but execution always requires your wallet signature. Guardrails
            help prevent unsupported actions and reduce ambiguous interpretation.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#171722] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <Sparkles className="w-5 h-5 text-primary mb-2" />
          <h3 className="text-sm font-semibold text-white mb-1">Why it matters</h3>
          <p className="text-xs text-white/65 leading-relaxed">
            DeFi UX is fragmented. RosePolkaAi reduces context switching and makes execution clearer by turning intent into
            structured drafts with transparent, in-chat transaction feedback.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] space-y-3">
        <h3 className="text-base font-semibold text-white">How to use</h3>
        <div className="space-y-2 text-sm text-white/75">
          <p>1) Connect wallet</p>
          <p>2) Type a request (example: “swap 25 usdc to usdt”)</p>
          <p>3) Review confirmation details (amount, chain, fees, destination)</p>
          <p>4) Sign and execute</p>
          <p>5) Track tx hash and outcome directly in chat</p>
        </div>
      </div>
    </div>
  );
}

