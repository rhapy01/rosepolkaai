import { CheckCircle2, Compass, Rocket, ShieldCheck, TrendingUp } from "lucide-react";

type RoadmapPhase = {
  title: string;
  horizon: string;
  objective: string;
  milestones: string[];
};

const PHASES: RoadmapPhase[] = [
  {
    title: "Phase 1 - Reliability and Trust",
    horizon: "0-30 days",
    objective: "Make every core action feel predictable, safe, and transparent for users.",
    milestones: [
      "Harden launch-token flow with stronger guardrails for supply, tax, and burn settings.",
      "Improve transaction recovery paths for slow confirmations and intermittent RPC conditions.",
      "Auto-add newly launched tokens to tracked assets after successful deployment.",
      "Complete UX polish pass for confirmations, warnings, and failure handling copy.",
    ],
  },
  {
    title: "Phase 2 - Capability Expansion",
    horizon: "31-60 days",
    objective: "Expand protocol coverage while keeping the same simple chat-first user flow.",
    milestones: [
      "Add more protocol adapters for swaps, lending, and capital-routing strategies.",
      "Launch richer educational mode with beginner/intermediate/advanced explainers.",
      "Ship analytics for prompt-to-execution conversion and error-category visibility.",
      "Improve bridge guidance by surfacing trust assumptions and expected finality clearly.",
    ],
  },
  {
    title: "Phase 3 - Production Readiness",
    horizon: "61-90 days",
    objective: "Prepare RosePolkaAi for broader usage with stronger security and operations.",
    milestones: [
      "Publish formal threat model and complete pre-audit hardening checklist.",
      "Package architecture, roles, and assumptions for independent security review.",
      "Introduce resilient infra with RPC failover and indexer-backed activity timelines.",
      "Ship release cadence with public changelog and roadmap accountability.",
    ],
  },
];

const PILLARS = [
  {
    icon: Rocket,
    title: "Execution Quality",
    text: "Keep natural-language execution fast, legible, and reliable across all major DeFi actions.",
  },
  {
    icon: ShieldCheck,
    title: "Security Posture",
    text: "Prioritize safety controls, explicit trust assumptions, and audit-readiness before scale.",
  },
  {
    icon: TrendingUp,
    title: "User Growth",
    text: "Drive repeat usage through better onboarding, clearer outcomes, and educational depth.",
  },
];

export default function RoadmapPanel() {
  return (
    <div className="flex-1 p-4 sm:p-6 max-w-4xl mx-auto w-full space-y-5">
      <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 sm:p-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl sm:text-2xl font-semibold text-white flex items-center gap-2">
              <Compass className="w-5 h-5 text-primary" />
              RosePolkaAi Roadmap
            </h2>
            <p className="mt-2 text-sm text-white/65 max-w-3xl">
              Our roadmap is focused on one principle: make advanced DeFi workflows feel as simple as conversation
              without sacrificing control, safety, or execution clarity.
            </p>
          </div>
          <span className="text-[10px] uppercase tracking-wide px-2.5 py-1 rounded-full border border-primary/35 bg-primary/15 text-primary">
            90-day plan
          </span>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {PILLARS.map((pillar) => (
          <div
            key={pillar.title}
            className="rounded-xl border border-white/10 bg-[#171722] p-4 shadow-[0_8px_24px_rgba(0,0,0,0.25)]"
          >
            <pillar.icon className="w-5 h-5 text-primary mb-2" />
            <h3 className="text-sm font-semibold text-white mb-1">{pillar.title}</h3>
            <p className="text-xs text-white/65 leading-relaxed">{pillar.text}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {PHASES.map((phase) => (
          <section
            key={phase.title}
            className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center justify-between gap-3 mb-2">
              <h3 className="text-base sm:text-lg font-semibold text-white">{phase.title}</h3>
              <span className="text-[10px] font-mono text-white/70 bg-white/10 px-2 py-1 rounded">{phase.horizon}</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed mb-3">{phase.objective}</p>
            <div className="space-y-2">
              {phase.milestones.map((m) => (
                <div key={m} className="flex items-start gap-2">
                  <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                  <p className="text-sm text-white/80 leading-relaxed">{m}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="rounded-2xl border border-primary/25 bg-primary/10 p-5">
        <p className="text-sm text-white/85 leading-relaxed">
          <span className="font-semibold text-white">Commitment:</span> RosePolkaAi is a long-term product effort. We are
          committed to continuous shipping, transparent communication, and security-first iteration as we scale from
          hackathon momentum into production-grade delivery.
        </p>
      </div>
    </div>
  );
}

