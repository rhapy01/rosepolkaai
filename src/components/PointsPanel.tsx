import { useAccount } from "wagmi";
import { usePoints } from "@/hooks/usePoints";
import { Trophy, Medal, Star, Loader2 } from "lucide-react";

function shortenAddress(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function PointsPanel() {
  const { address } = useAccount();
  const { userPoints, leaderboard, isLoading } = usePoints(address);

  return (
    <div className="flex-1 p-4 max-w-[800px] mx-auto w-full space-y-4">
      {/* User points card */}
      {address && (
        <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-5 text-center space-y-2 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          <div className="w-12 h-12 rounded-full bg-[#171722] flex items-center justify-center mx-auto">
            <Star className="w-6 h-6 text-primary" />
          </div>
          <p className="text-[10px] uppercase tracking-widest text-white/55">Your Points</p>
          <p className="text-3xl font-mono font-bold text-white">{userPoints.totalPoints.toLocaleString()}</p>
          {userPoints.rank > 0 && (
            <p className="text-xs text-white/60">
              Rank <span className="text-white font-semibold">#{userPoints.rank}</span>
            </p>
          )}
          <p className="text-[10px] text-white/55">Earn 100 points per transaction</p>
        </div>
      )}

      {/* Leaderboard */}
      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-white flex items-center gap-2">
          <Trophy className="w-4 h-4 text-primary" />
          Leaderboard
        </h2>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-white/50" />
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-6 text-center shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
            <p className="text-sm text-white/60">No rankings yet. Be the first!</p>
          </div>
        ) : (
          leaderboard.map((entry) => {
            const isCurrentUser = address?.toLowerCase() === entry.wallet_address;
            const rankIcon =
              entry.rank === 1 ? "🥇" :
              entry.rank === 2 ? "🥈" :
              entry.rank === 3 ? "🥉" : null;

            return (
              <div
                key={entry.wallet_address}
                className={`rounded-xl border border-white/10 bg-[#0f0f15] p-3 flex items-center gap-3 shadow-[0_8px_24px_rgba(0,0,0,0.35)] ${
                  isCurrentUser ? "ring-1 ring-primary/30" : ""
                }`}
              >
                <div className="w-8 h-8 rounded-lg bg-[#171722] flex items-center justify-center shrink-0">
                  {rankIcon ? (
                    <span className="text-sm">{rankIcon}</span>
                  ) : (
                    <span className="text-xs font-mono text-white/60">#{entry.rank}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-mono text-white">
                    {isCurrentUser ? "You" : shortenAddress(entry.wallet_address)}
                  </p>
                  <p className="text-[10px] text-white/55">{entry.tx_count} transactions</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Medal className="w-3 h-3 text-primary" />
                  <span className="text-sm font-mono font-semibold text-white">
                    {entry.total_points.toLocaleString()}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
