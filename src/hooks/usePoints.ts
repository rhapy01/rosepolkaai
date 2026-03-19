import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UserPoints {
  totalPoints: number;
  rank: number;
}

interface LeaderboardEntry {
  wallet_address: string;
  total_points: number;
  tx_count: number;
  rank: number;
}

export function usePoints(walletAddress?: string) {
  const [userPoints, setUserPoints] = useState<UserPoints>({ totalPoints: 0, rank: 0 });
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchUserPoints = useCallback(async () => {
    if (!walletAddress) return;
    const { data } = await supabase.rpc("get_user_points", {
      wallet: walletAddress.toLowerCase(),
    });

    if (data && (data as unknown as LeaderboardEntry[]).length > 0) {
      const row = (data as unknown as LeaderboardEntry[])[0];
      setUserPoints({ totalPoints: row.total_points, rank: row.rank });
    }
  }, [walletAddress]);

  const fetchLeaderboard = useCallback(async () => {
    setIsLoading(true);
    const { data } = await supabase.rpc("get_leaderboard", { limit_count: 50 });
    if (data) setLeaderboard(data as unknown as LeaderboardEntry[]);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    fetchUserPoints();
    fetchLeaderboard();
  }, [fetchUserPoints, fetchLeaderboard]);

  // Realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("points-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "points_ledger" },
        () => {
          fetchUserPoints();
          fetchLeaderboard();
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchUserPoints, fetchLeaderboard]);

  return { userPoints, leaderboard, isLoading, refetch: fetchLeaderboard };
}
