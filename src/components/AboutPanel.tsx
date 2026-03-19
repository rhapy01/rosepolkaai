import { BookOpen, Heart, Sparkles } from "lucide-react";

export default function AboutPanel() {
  return (
    <div className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary" />
              About Rose PolkaAi
            </h2>
            <p className="mt-2 text-sm text-white/65 max-w-3xl leading-relaxed">
              Rose PolkaAi is an app that helps you explore DeFi on Polkadot Hub without hunting through endless menus.
              You chat in everyday language—swap, stake, add liquidity, check what you hold—and the app walks you through
              the rest in one place. We built it for people who want DeFi to feel approachable, not intimidating.
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
          <h3 className="text-sm font-semibold text-white mb-1">What you can do</h3>
          <p className="text-xs text-white/65 leading-relaxed">
            Move between tokens, try bridging, earn with staking, work with liquidity pools, mint a demo NFT, and see your
            balances in a simple portfolio view. It’s the same kinds of things you’d do in DeFi—just gathered around a
            conversation instead of a dozen tabs.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#171722] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <Heart className="w-5 h-5 text-primary mb-2" />
          <h3 className="text-sm font-semibold text-white mb-1">What we care about</h3>
          <p className="text-xs text-white/65 leading-relaxed">
            Clarity first. You should always understand what you’re about to do before you do it. Rose PolkaAi is meant to
            feel like a helpful guide—answering questions, suggesting next steps, and keeping the experience human.
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#171722] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]">
          <Sparkles className="w-5 h-5 text-primary mb-2" />
          <h3 className="text-sm font-semibold text-white mb-1">Why we built it</h3>
          <p className="text-xs text-white/65 leading-relaxed">
            DeFi is powerful but easy to get lost in. Rose PolkaAi is our take on making Polkadot Hub feel friendlier:
            one home for chatting, learning, and taking action—without assuming you already speak “crypto native.”
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.35)] space-y-3">
        <h3 className="text-base font-semibold text-white">Getting started</h3>
        <div className="space-y-2 text-sm text-white/75">
          <p>1) Connect your wallet so Rose PolkaAi can show what you have on Polkadot Hub.</p>
          <p>
            2) Say what you want in the chat—e.g.{" "}
            <span className="text-white/90 font-medium">“swap 25 USDC to USDT”</span> or{" "}
            <span className="text-white/90 font-medium">“show my balances”</span>.
          </p>
          <p>3) Read what the app suggests and adjust if something doesn’t look right.</p>
          <p>4) When you’re ready, go ahead with the action from the app.</p>
          <p>5) Follow along in the chat as things progress.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#171722] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.25)] space-y-3">
        <h3 className="text-base font-semibold text-white">Example things to try</h3>
        <div className="space-y-2 text-sm text-white/75">
          <p>
            • <span className="text-white/90 font-medium">“swap 10 DOMAIN to USDC”</span>
          </p>
          <p>
            • <span className="text-white/90 font-medium">“stake”</span> — then choose an asset you hold
          </p>
          <p>
            • <span className="text-white/90 font-medium">“unstake”</span> — then choose what you’ve staked
          </p>
          <p>
            • <span className="text-white/90 font-medium">“add liquidity USDC/USDT”</span> or{" "}
            <span className="text-white/90 font-medium">“remove liquidity”</span>
          </p>
        </div>
        <p className="text-xs text-white/55">
          This version is an MVP: live prices aren’t wired in yet, so numbers you see are from the chain directly.
        </p>
      </div>
    </div>
  );
}
