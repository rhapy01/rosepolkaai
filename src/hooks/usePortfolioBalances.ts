import { useEffect, useMemo, useState } from "react";
import { usePublicClient } from "wagmi";
import { formatUnits, type Address } from "viem";
import { ERC20_ABI, HUB_TOKENS } from "@/lib/contracts";

export interface TokenBalance {
  symbol: string;
  address?: Address; // undefined = native
  decimals: number;
  raw: bigint;
  formatted: string;
}

const DEFAULT_TRACKED_TOKENS: { symbol: string; address?: Address }[] = [
  { symbol: "DOT" }, // native
  ...Object.entries(HUB_TOKENS).map(([symbol, address]) => ({ symbol, address })),
];

export function usePortfolioBalances(account?: Address) {
  const publicClient = usePublicClient();
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tokens = useMemo(() => DEFAULT_TRACKED_TOKENS, []);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      if (!publicClient || !account) {
        setBalances([]);
        setIsLoading(false);
        setError(null);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const results: TokenBalance[] = [];

        // Native balance (DOT)
        const nativeRaw = await publicClient.getBalance({ address: account });
        results.push({
          symbol: "DOT",
          decimals: 18,
          raw: nativeRaw,
          formatted: formatUnits(nativeRaw, 18),
        });

        // ERC20 balances
        for (const t of tokens) {
          if (!t.address) continue;

          const [decimals, symbol, raw] = (await Promise.all([
            publicClient.readContract({
              address: t.address,
              abi: ERC20_ABI,
              functionName: "decimals",
            } as any),
            publicClient.readContract({
              address: t.address,
              abi: ERC20_ABI,
              functionName: "symbol",
            } as any),
            publicClient.readContract({
              address: t.address,
              abi: ERC20_ABI,
              functionName: "balanceOf",
              args: [account],
            } as any),
          ])) as [number, string, bigint];

          results.push({
            symbol: symbol || t.symbol,
            address: t.address,
            decimals,
            raw,
            formatted: formatUnits(raw, decimals),
          });
        }

        if (!cancelled) setBalances(results);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load balances");
          setBalances([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [publicClient, account, tokens]);

  return { balances, isLoading, error };
}

