import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { TransactionDraft } from "@/components/ActionCard";

export interface TransactionRecord {
  id: string;
  wallet_address: string;
  intent: string;
  summary: string;
  params: Record<string, unknown>;
  tx_hash: string | null;
  block_number: number | null;
  status: string;
  platform_fee: string | null;
  points_earned: number;
  created_at: string;
}

const PLATFORM_FEE_RATE = 0.001; // 0.1%
const POINTS_PER_ACTION = 100;

export function useTransactionHistory(walletAddress?: string) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchTransactions = useCallback(async () => {
    if (!walletAddress) return;
    setIsLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("*")
      .eq("wallet_address", walletAddress.toLowerCase())
      .order("created_at", { ascending: false })
      .limit(50);

    if (data) setTransactions(data as unknown as TransactionRecord[]);
    setIsLoading(false);
  }, [walletAddress]);

  useEffect(() => {
    fetchTransactions();
  }, [fetchTransactions]);

  // Subscribe to realtime updates
  useEffect(() => {
    if (!walletAddress) return;

    const channel = supabase
      .channel("tx-updates")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "transactions" },
        () => fetchTransactions()
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [walletAddress, fetchTransactions]);

  const saveTransaction = useCallback(
    async (draft: TransactionDraft, txHash?: string, blockNumber?: bigint) => {
      if (!walletAddress) return null;

      const amount = (() => {
        if (draft.intent === "addLiquidity") {
          const totalEquivalent = parseFloat(draft.params.usdcEquivalentTotal || "0");
          if (Number.isFinite(totalEquivalent) && totalEquivalent > 0) return totalEquivalent;
          const a0 = parseFloat(draft.params.amount0 || "0");
          const a1 = parseFloat(draft.params.amount1 || "0");
          return (Number.isFinite(a0) ? a0 : 0) + (Number.isFinite(a1) ? a1 : 0);
        }
        if (draft.intent === "removeLiquidity") {
          const lp = parseFloat(draft.params.lpAmount || "0");
          return Number.isFinite(lp) ? lp : 0;
        }
        const base = parseFloat(draft.params.amount || "0");
        return Number.isFinite(base) ? base : 0;
      })();
      const fee = (amount * PLATFORM_FEE_RATE).toFixed(6);

      const insertData = {
        wallet_address: walletAddress.toLowerCase(),
        intent: draft.intent,
        summary: draft.summary,
        params: draft.params as unknown as Record<string, never>,
        tx_hash: txHash || null,
        block_number: blockNumber ? Number(blockNumber) : null,
        status: txHash ? "finalized" : "pending",
        platform_fee: fee,
        points_earned: POINTS_PER_ACTION,
      };

      const { data: txData, error } = await supabase
        .from("transactions")
        .insert([insertData] as any)
        .select()
        .single();

      if (error) {
        console.error("Failed to save transaction:", error);
        return null;
      }

      // Award points
      if (txData) {
        await supabase.from("points_ledger").insert({
          wallet_address: walletAddress.toLowerCase(),
          points: POINTS_PER_ACTION,
          reason: `${draft.intent}: ${draft.summary}`,
          tx_id: (txData as unknown as TransactionRecord).id,
        });
      }

      return txData;
    },
    [walletAddress]
  );

  const calculatePlatformFee = (amount: string): string => {
    const num = parseFloat(amount || "0");
    return (num * PLATFORM_FEE_RATE).toFixed(6);
  };

  return {
    transactions,
    isLoading,
    saveTransaction,
    calculatePlatformFee,
    refetch: fetchTransactions,
    PLATFORM_FEE_RATE,
    POINTS_PER_ACTION,
  };
}
