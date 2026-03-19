import { useEffect, useMemo, useState } from "react";
import { useAccount, usePublicClient } from "wagmi";
import { formatUnits, type Address } from "viem";
import { useTransactionHistory } from "@/hooks/useTransactionHistory";
import { usePortfolioBalances } from "@/hooks/usePortfolioBalances";
import {
  DEFAI_ACCESS_PASS_NFT_ABI,
  DEFAI_STAKING_VAULT_ABI,
  ERC20_ABI,
  HUB_ACCESS_PASS_NFT,
  HUB_STAKING_VAULTS,
} from "@/lib/contracts";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import {
  Wallet,
  Coins,
  Landmark,
  TrendingUp,
  Loader2,
  CircleDot,
  ImageIcon,
} from "lucide-react";

const chartConfig = {
  count: { label: "Actions", color: "hsl(var(--primary))" },
  date: { label: "Date" },
};

const PANEL_CLASS =
  "rounded-2xl border border-white/10 bg-[#0f0f15] p-4 sm:p-5 shadow-[0_8px_24px_rgba(0,0,0,0.35)]";
const SUBTLE_BOX_CLASS = "rounded-xl border border-white/10 bg-[#171722] p-3";

export default function PortfolioDashboard() {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { transactions, isLoading: txLoading } = useTransactionHistory(address);
  const { balances, isLoading: balancesLoading, error: balancesError } = usePortfolioBalances(
    address as any
  );
  const [stakingPositions, setStakingPositions] = useState<
    {
      tokenSymbol: string;
      rewardSymbol: string;
      stakedFormatted: string;
      pendingFormatted: string;
      vault: Address;
    }[]
  >([]);
  const [stakingLoading, setStakingLoading] = useState(false);
  const [stakingError, setStakingError] = useState<string | null>(null);
  const [nftCount, setNftCount] = useState<bigint>(0n);
  const [nftName, setNftName] = useState("DeFAI Access Pass");
  const [nftSymbol, setNftSymbol] = useState("DFPASS");
  const [nftLoading, setNftLoading] = useState(false);
  const [nftError, setNftError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStakingPositions() {
      if (!publicClient || !address) {
        setStakingPositions([]);
        setStakingLoading(false);
        setStakingError(null);
        return;
      }

      setStakingLoading(true);
      setStakingError(null);

      try {
        const positions: {
          tokenSymbol: string;
          rewardSymbol: string;
          stakedFormatted: string;
          pendingFormatted: string;
          vault: Address;
        }[] = [];

        for (const vault of Object.values(HUB_STAKING_VAULTS)) {
          if (!vault || vault.toLowerCase() === "0x0000000000000000000000000000000000000000") continue;

          const [stakingToken, rewardToken] = (await Promise.all([
            publicClient.readContract({
              address: vault,
              abi: DEFAI_STAKING_VAULT_ABI,
              functionName: "stakingToken",
            } as any),
            publicClient.readContract({
              address: vault,
              abi: DEFAI_STAKING_VAULT_ABI,
              functionName: "rewardToken",
            } as any),
          ])) as [Address, Address];

          const [userInfo, pending, stakingDecimals, stakingSymbol, rewardDecimals, rewardSymbol] = (await Promise.all([
            publicClient.readContract({
              address: vault,
              abi: DEFAI_STAKING_VAULT_ABI,
              functionName: "userInfo",
              args: [address],
            } as any),
            publicClient.readContract({
              address: vault,
              abi: DEFAI_STAKING_VAULT_ABI,
              functionName: "pendingRewards",
              args: [address],
            } as any),
            publicClient.readContract({
              address: stakingToken,
              abi: ERC20_ABI,
              functionName: "decimals",
            } as any),
            publicClient.readContract({
              address: stakingToken,
              abi: ERC20_ABI,
              functionName: "symbol",
            } as any),
            publicClient.readContract({
              address: rewardToken,
              abi: ERC20_ABI,
              functionName: "decimals",
            } as any),
            publicClient.readContract({
              address: rewardToken,
              abi: ERC20_ABI,
              functionName: "symbol",
            } as any),
          ])) as [readonly [bigint, bigint, bigint], bigint, number, string, number, string];

          const stakedAmount = userInfo[0];
          if (stakedAmount === 0n && pending === 0n) continue;

          positions.push({
            tokenSymbol: stakingSymbol,
            rewardSymbol,
            stakedFormatted: formatUnits(stakedAmount, stakingDecimals),
            pendingFormatted: formatUnits(pending, rewardDecimals),
            vault,
          });
        }

        if (!cancelled) setStakingPositions(positions);
      } catch (e) {
        if (!cancelled) {
          setStakingPositions([]);
          setStakingError(e instanceof Error ? e.message : "Failed to load staking positions");
        }
      } finally {
        if (!cancelled) setStakingLoading(false);
      }
    }

    loadStakingPositions();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  useEffect(() => {
    let cancelled = false;

    async function loadNfts() {
      if (!publicClient || !address) {
        setNftCount(0n);
        setNftLoading(false);
        setNftError(null);
        return;
      }

      if (!HUB_ACCESS_PASS_NFT || HUB_ACCESS_PASS_NFT.toLowerCase() === "0x0000000000000000000000000000000000000000") {
        setNftCount(0n);
        setNftError("NFT contract is not configured.");
        setNftLoading(false);
        return;
      }

      setNftLoading(true);
      setNftError(null);

      try {
        const [count, name, symbol] = (await Promise.all([
          publicClient.readContract({
            address: HUB_ACCESS_PASS_NFT,
            abi: DEFAI_ACCESS_PASS_NFT_ABI,
            functionName: "balanceOf",
            args: [address],
          } as any),
          publicClient.readContract({
            address: HUB_ACCESS_PASS_NFT,
            abi: DEFAI_ACCESS_PASS_NFT_ABI,
            functionName: "name",
          } as any),
          publicClient.readContract({
            address: HUB_ACCESS_PASS_NFT,
            abi: DEFAI_ACCESS_PASS_NFT_ABI,
            functionName: "symbol",
          } as any),
        ])) as [bigint, string, string];

        if (!cancelled) {
          setNftCount(count);
          setNftName(name || "DeFAI Access Pass");
          setNftSymbol(symbol || "DFPASS");
        }
      } catch (e) {
        if (!cancelled) {
          setNftCount(0n);
          setNftError(e instanceof Error ? e.message : "Failed to load NFT holdings");
        }
      } finally {
        if (!cancelled) setNftLoading(false);
      }
    }

    loadNfts();
    return () => {
      cancelled = true;
    };
  }, [publicClient, address]);

  const totalBalanceLabel = useMemo(() => {
    // We don't have price feeds wired yet; show total in DOT units as a simple sum of known balances.
    const dot = balances.find((b) => b.symbol.toUpperCase() === "DOT");
    return dot ? `${Number(dot.formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} DOT` : "—";
  }, [balances]);

  const chartData = useMemo(() => {
    const now = new Date();
    const days: { date: string; count: number; day: string }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const count = transactions.filter(
        (tx) => tx.created_at.slice(0, 10) === dateStr
      ).length;
      days.push({ date: dateStr, count, day: dayLabel });
    }
    return days;
  }, [transactions]);

  if (!address) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center max-w-[800px] w-full">
        <div className="w-14 h-14 rounded-full bg-[#171722] flex items-center justify-center mb-4">
          <Wallet className="w-7 h-7 text-white/70" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-1">Portfolio</h2>
        <p className="text-sm text-white/60">Connect your wallet to view balances, staking, lending, and activity.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 w-full max-w-[800px] mx-auto space-y-6 pb-4">
      <h1 className="text-lg font-semibold text-white tracking-tight">Portfolio</h1>

      {/* Total balance */}
      <section className={PANEL_CLASS}>
        <div className="flex items-center gap-2 mb-4">
          <Wallet className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Total Balance</h2>
        </div>
        <p className="text-2xl sm:text-3xl font-mono font-semibold text-white mb-2">
          {balancesLoading ? "Loading…" : totalBalanceLabel}
        </p>
        <p className="text-[11px] text-white/55 mb-4">
          Prices are not connected yet; this shows on-chain balances only.
        </p>

        {balancesError ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            Failed to load balances: {balancesError}
          </div>
        ) : (
          <div className="space-y-1">
            {balances.map((b) => (
              <div
                key={`${b.symbol}-${b.address ?? "native"}`}
                className="flex items-center justify-between py-2.5 border-b border-white/10 last:border-0"
              >
                <div className="flex items-center gap-2">
                  <CircleDot className={`w-4 h-4 ${b.symbol.toUpperCase() === "DOT" ? "text-primary" : "text-success"}`} />
                  <span className="text-sm font-semibold text-white">{b.symbol}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-white">
                    {Number(b.formatted).toLocaleString("en-US", { maximumFractionDigits: 6 })}
                  </p>
                  {b.address && (
                    <p className="text-[10px] text-white/50 font-mono">
                      {b.address.slice(0, 6)}…{b.address.slice(-4)}
                    </p>
                  )}
                </div>
              </div>
            ))}
            {balances.length === 0 && !balancesLoading && (
              <p className="text-xs text-white/55">No balances to display.</p>
            )}
          </div>
        )}
      </section>

      {/* Staking positions */}
      <section className={PANEL_CLASS}>
        <div className="flex items-center gap-2 mb-4">
          <Coins className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Staking Positions</h2>
        </div>
        {stakingLoading ? (
          <div className="flex items-center justify-center h-[80px]">
            <Loader2 className="w-5 h-5 animate-spin text-white/50" />
          </div>
        ) : stakingError ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            Failed to load staking positions: {stakingError}
          </div>
        ) : stakingPositions.length === 0 ? (
          <div className={SUBTLE_BOX_CLASS}>
            <p className="text-xs text-white/60">
              No active staking positions found yet. Try: stake USDC or stake USDT.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {stakingPositions.map((position) => (
              <div
                key={position.vault}
                className={`${SUBTLE_BOX_CLASS} flex items-center justify-between`}
              >
                <div>
                  <p className="text-sm font-medium text-white">{position.tokenSymbol} Vault</p>
                  <p className="text-[11px] text-white/50 font-mono">
                    {position.vault.slice(0, 6)}...{position.vault.slice(-4)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-mono text-white">
                    Staked: {Number(position.stakedFormatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} {position.tokenSymbol}
                  </p>
                  <p className="text-[11px] text-success font-mono">
                    Pending: {Number(position.pendingFormatted).toLocaleString("en-US", { maximumFractionDigits: 6 })} {position.rewardSymbol}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* NFT holdings */}
      <section className={PANEL_CLASS}>
        <div className="flex items-center gap-2 mb-4">
          <ImageIcon className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">NFT Holdings</h2>
        </div>
        {nftLoading ? (
          <div className="flex items-center justify-center h-[80px]">
            <Loader2 className="w-5 h-5 animate-spin text-white/50" />
          </div>
        ) : nftError ? (
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-3 text-xs text-destructive">
            Failed to load NFTs: {nftError}
          </div>
        ) : (
          <div className={`${SUBTLE_BOX_CLASS} flex items-center justify-between`}>
            <div>
              <p className="text-sm font-medium text-white">{nftName}</p>
              <p className="text-[11px] text-white/50 font-mono">
                {nftSymbol} • {HUB_ACCESS_PASS_NFT.slice(0, 6)}...{HUB_ACCESS_PASS_NFT.slice(-4)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono text-white">Owned: {nftCount.toString()}</p>
            </div>
          </div>
        )}
      </section>

      {/* Lending positions */}
      <section className={PANEL_CLASS}>
        <div className="flex items-center gap-2 mb-4">
          <Landmark className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Lending Positions</h2>
        </div>
        <div className={SUBTLE_BOX_CLASS}>
          <p className="text-xs text-white/60">
            Lending and unlend actions are executable in demo mode and route through the DeFAI vault rails. Dedicated lending position reads/indexer view will be added next.
          </p>
        </div>
      </section>

      {/* Recent activity chart */}
      <section className={PANEL_CLASS}>
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-primary" />
          <h2 className="text-sm font-semibold text-white">Recent Activity</h2>
        </div>
        {txLoading ? (
          <div className="flex items-center justify-center h-[240px]">
            <Loader2 className="w-6 h-6 animate-spin text-white/50" />
          </div>
        ) : chartData.every((d) => d.count === 0) ? (
          <div className="flex flex-col items-center justify-center h-[200px] text-center">
            <p className="text-sm text-white/65">No activity in the last 14 days.</p>
            <p className="text-xs text-white/55 mt-1">Execute actions from the home command bar to see activity here.</p>
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <AreaChart
              data={chartData}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
              <XAxis
                dataKey="day"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
              />
              <YAxis
                tickLine={false}
                axisLine={false}
                tick={{ fill: "hsl(var(--muted-foreground))" }}
                allowDecimals={false}
              />
              <Tooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) => (payload?.[0]?.payload?.day as string) ?? ""}
                  />
                }
              />
              <Area
                type="monotone"
                dataKey="count"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.2}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </section>
    </div>
  );
}
