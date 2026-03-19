import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked, stringToHex, type Address, type Hash } from "viem";
import { getPublicClient, getWalletClient } from "@wagmi/core";
import { toast } from "sonner";
import { baseSepolia, config as wagmiConfig, polkadotHub } from "@/lib/wagmi-config";
import {
  ERC20_ABI,
  DEFAI_ACCESS_PASS_NFT_ABI,
  DEFAI_AMM_POOL_ABI,
  DEFAI_STAKING_VAULT_ABI,
  DEFAI_BRIDGE_GATEWAY_ABI,
  DEFAI_TOKEN_FACTORY_ABI,
  BASE_TOKENS,
  HUB_TOKENS,
  HUB_STAKING_VAULTS,
  HUB_ACCESS_PASS_NFT,
  HUB_TOKEN_FACTORY,
  HUB_BRIDGE_GATEWAY,
  BASE_BRIDGE_GATEWAY,
  BASE_SEPOLIA_CHAIN_ID,
} from "@/lib/contracts";
import { HUB_AMM_POOLS, ammPairKey } from "@/lib/amm-pools";
import type { TransactionDraft } from "@/components/ActionCard";

export type ExecutionStep =
  | "idle"
  | "approving"
  | "simulating"
  | "awaiting-signature"
  | "broadcasting"
  | "confirming"
  | "finalized"
  | "error";

interface ExecutionState {
  step: ExecutionStep;
  txHash: Hash | null;
  blockNumber: bigint | null;
  error: string | null;
}

export interface ExecutionResult {
  success: boolean;
  txHash?: Hash;
  blockNumber?: bigint;
  chainId?: number;
  pending?: boolean;
  error?: string;
  swap?: {
    fromToken: string;
    toToken: string;
    amountIn: string;
    amountOutEstimated: string;
  };
}

export function useContractExecution() {
  const BURN_ADDRESS = "0x000000000000000000000000000000000000dEaD" as Address;
  const { address, chainId } = useAccount();
  const publicClient = usePublicClient({ chainId: polkadotHub.id });
  const { data: walletClient } = useWalletClient();

  const isZeroAddress = (a: Address) => a.toLowerCase() === "0x0000000000000000000000000000000000000000";

  const normalizeSymbol = (symbol?: string): string => {
    if (!symbol) return "";
    return symbol.trim().replace(/^\$+/, "").replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  };

  const sanitizeAmount = (value?: string, fallback = "0"): string => {
    if (!value) return fallback;
    const cleaned = value.replace(/[^0-9.]/g, "");
    if (!cleaned) return fallback;
    return cleaned;
  };

  const parseSlippageBps = (s?: string): bigint => {
    // Accept "0.5%", "1", "1%" → basis points
    if (!s) return 50n; // default 0.50%
    const cleaned = s.trim().replace("%", "");
    const n = Number(cleaned);
    if (!Number.isFinite(n) || n < 0) return 50n;
    return BigInt(Math.round(n * 100)); // percent → bps
  };

  const parseDestinationChainId = (toChain: string | undefined, sourceChainId: number): bigint => {
    if (!toChain) {
      return BigInt(sourceChainId === BASE_SEPOLIA_CHAIN_ID ? polkadotHub.id : BASE_SEPOLIA_CHAIN_ID);
    }
    const normalized = toChain.toLowerCase();
    if (normalized.includes("base")) return BigInt(BASE_SEPOLIA_CHAIN_ID);
    if (normalized.includes("polkadot") || normalized.includes("hub")) return BigInt(polkadotHub.id);
    const numeric = Number.parseInt(toChain, 10);
    if (Number.isFinite(numeric)) return BigInt(numeric);
    return BigInt(sourceChainId === BASE_SEPOLIA_CHAIN_ID ? polkadotHub.id : BASE_SEPOLIA_CHAIN_ID);
  };

  const deriveBridgeSecret = (sender: Address, userNonce: bigint, destinationChainId: bigint) => {
    const salt = keccak256(stringToHex("DEFAI_BRIDGE_SECRET_V1"));
    return keccak256(
      encodePacked(["bytes32", "address", "uint256", "uint256"], [salt, sender, userNonce, destinationChainId])
    );
  };

  const amountOutMinFromSlippage = (amountOut: bigint, slippageBps: bigint) => {
    if (slippageBps >= 10_000n) return 0n;
    return (amountOut * (10_000n - slippageBps)) / 10_000n;
  };

  const [state, setState] = useState<ExecutionState>({
    step: "idle",
    txHash: null,
    blockNumber: null,
    error: null,
  });

  const reset = useCallback(() => {
    setState({ step: "idle", txHash: null, blockNumber: null, error: null });
  }, []);

  const resolveToken = (symbol?: string): Address | null => {
    const upper = normalizeSymbol(symbol);
    if (!upper) return null;
    return HUB_TOKENS[upper] ?? null;
  };

  const resolveAmmPool = (aSym: string, bSym: string): Address | null => {
    const k1 = ammPairKey(aSym, bSym);
    const k2 = ammPairKey(bSym, aSym);
    return (HUB_AMM_POOLS[k1] || HUB_AMM_POOLS[k2] || null) as Address | null;
  };

  const resolveBridgeToken = (sourceChainId: number, symbol?: string): Address | null => {
    const upper = normalizeSymbol(symbol);
    if (!upper) return null;
    if (sourceChainId === BASE_SEPOLIA_CHAIN_ID) return BASE_TOKENS[upper] ?? null;
    return HUB_TOKENS[upper] ?? null;
  };

  const resolveStakingVault = (symbol?: string): Address | null => {
    if (!symbol) return HUB_STAKING_VAULTS.USDC ?? null;
    const upper = symbol.toUpperCase();
    return HUB_STAKING_VAULTS[upper] ?? null;
  };

  const getActiveWalletClient = useCallback(async () => {
    if (walletClient) return walletClient;
    return getWalletClient(wagmiConfig);
  }, [walletClient]);

  const executeSwap = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();

      const { params } = draft;
      const fromToken = resolveToken(params.fromToken);
      const toToken = resolveToken(params.toToken);
      const fromTokenSymbol = normalizeSymbol(params.fromToken);
      const toTokenSymbol = normalizeSymbol(params.toToken);
      const pool = resolveAmmPool(fromTokenSymbol, toTokenSymbol);
      if (!pool || isZeroAddress(pool)) {
        throw new Error(`AMM pool is not configured for ${fromTokenSymbol}/${toTokenSymbol}.`);
      }
      const amountRaw = sanitizeAmount(params.amount, "0");
      const slippageBps = parseSlippageBps(params.slippage);
      if (!fromToken || !toToken) {
        throw new Error("Swap supports configured ERC20 pairs (USDC/USDT) for this demo.");
      }

      const poolToken0 = (await publicClient.readContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "token0",
      })) as Address;
      const poolToken1 = (await publicClient.readContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "token1",
      })) as Address;
      const inPool =
        (fromToken.toLowerCase() === poolToken0.toLowerCase() && toToken.toLowerCase() === poolToken1.toLowerCase()) ||
        (fromToken.toLowerCase() === poolToken1.toLowerCase() && toToken.toLowerCase() === poolToken0.toLowerCase());
      if (!inPool) {
        throw new Error(
          `AMM pool does not support ${fromTokenSymbol || "tokenIn"} -> ${toTokenSymbol || "tokenOut"} on this network.`
        );
      }

      const fromDecimals = (await publicClient.readContract({
        address: fromToken,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;
      const toDecimals = (await publicClient.readContract({
        address: toToken,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;
      const amountIn = parseUnits(amountRaw, fromDecimals);
      const walletBalance = (await publicClient.readContract({
        address: fromToken,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      if (walletBalance < amountIn) {
        throw new Error(
          `Insufficient ${fromTokenSymbol || "input token"} balance. Need ${formatUnits(amountIn, fromDecimals)}, wallet has ${formatUnits(walletBalance, fromDecimals)}.`
        );
      }

      setState((s) => ({ ...s, step: "approving" }));
      const allowance = (await publicClient.readContract({
        address: fromToken,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, pool],
      })) as bigint;

      if (allowance < amountIn) {
        const approveHash = await activeWalletClient.writeContract({
          address: fromToken,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [pool, amountIn],
          chain: polkadotHub,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setState((s) => ({ ...s, step: "simulating" }));
      const expectedOut = (await publicClient.readContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "quote",
        args: [fromToken, amountIn],
      })) as bigint;
      const amountOutMin = amountOutMinFromSlippage(expectedOut, slippageBps);

      await publicClient.simulateContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "swapExactInput",
        args: [fromToken, amountIn, amountOutMin, address],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "swapExactInput",
        args: [fromToken, amountIn, amountOutMin, address],
        chain: polkadotHub,
        account: address,
      });

      return {
        hash,
        swap: {
          fromToken: fromTokenSymbol,
          toToken: toTokenSymbol,
          amountIn: formatUnits(amountIn, fromDecimals),
          amountOutEstimated: formatUnits(expectedOut, toDecimals),
        },
      };
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeAddLiquidity = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();

      const p = draft.params;
      const sym0 = normalizeSymbol(p.token0 || p.fromToken || "USDC");
      const sym1 = normalizeSymbol(p.token1 || p.toToken || "USDT");
      const pool = resolveAmmPool(sym0, sym1);
      if (!pool || isZeroAddress(pool)) {
        throw new Error(`AMM pool is not configured for ${sym0}/${sym1}.`);
      }
      const token0 = resolveToken(sym0);
      const token1 = resolveToken(sym1);
      if (!token0 || !token1) throw new Error("Liquidity supports configured demo ERC20 tokens (e.g. USDC/USDT).");

      const decimals0 = (await publicClient.readContract({
        address: token0,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;
      const decimals1 = (await publicClient.readContract({
        address: token1,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;

      // Ensure the chosen pair matches the pool
      const poolToken0 = (await publicClient.readContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "token0",
      })) as Address;
      const poolToken1 = (await publicClient.readContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "token1",
      })) as Address;
      const matchesPool =
        token0.toLowerCase() === poolToken0.toLowerCase() && token1.toLowerCase() === poolToken1.toLowerCase();
      const matchesReversed =
        token0.toLowerCase() === poolToken1.toLowerCase() && token1.toLowerCase() === poolToken0.toLowerCase();
      if (!matchesPool && !matchesReversed) {
        throw new Error(`This AMM pool only supports ${sym0}/${sym1} if it matches the deployed pair.`);
      }

      const token0Pool = matchesPool ? token0 : token1;
      const token1Pool = matchesPool ? token1 : token0;
      const decimals0Pool = matchesPool ? decimals0 : decimals1;
      const decimals1Pool = matchesPool ? decimals1 : decimals0;

      let amount0Pool: bigint;
      let amount1Pool: bigint;
      const equivalentTotalRaw = sanitizeAmount(p.usdcEquivalentTotal, "");
      const hasEquivalentMode = equivalentTotalRaw.length > 0 && Number(equivalentTotalRaw) > 0;

      if (hasEquivalentMode) {
        const stableSymbols = new Set(["USDC", "USDT"]);
        const poolSym0 = matchesPool ? sym0 : sym1;
        const poolSym1 = matchesPool ? sym1 : sym0;
        const stableIsToken0 = stableSymbols.has(poolSym0);
        const stableIsToken1 = stableSymbols.has(poolSym1);
        if (!stableIsToken0 && !stableIsToken1) {
          throw new Error("USDC-equivalent mode requires one side of the pair to be USDC or USDT.");
        }

        const total = Number(equivalentTotalRaw);
        const half = total / 2;
        const halfRaw = Number.isFinite(half) && half > 0 ? String(half) : "0";
        if (halfRaw === "0") {
          throw new Error("Equivalent total must be greater than 0.");
        }

        if (stableIsToken0) {
          const stableIn = parseUnits(halfRaw, decimals0Pool);
          const otherOut = (await publicClient.readContract({
            address: pool,
            abi: DEFAI_AMM_POOL_ABI,
            functionName: "quote",
            args: [token0Pool, stableIn],
          })) as bigint;
          amount0Pool = stableIn;
          amount1Pool = otherOut;
        } else {
          const stableIn = parseUnits(halfRaw, decimals1Pool);
          const otherOut = (await publicClient.readContract({
            address: pool,
            abi: DEFAI_AMM_POOL_ABI,
            functionName: "quote",
            args: [token1Pool, stableIn],
          })) as bigint;
          amount0Pool = otherOut;
          amount1Pool = stableIn;
        }
      } else {
        const amount0Raw = sanitizeAmount(p.amount0 || p.amount, "0");
        const amount1Raw = sanitizeAmount(p.amount1, "0");
        const amount0Desired = parseUnits(amount0Raw, decimals0);
        const amount1Desired = parseUnits(amount1Raw, decimals1);
        if (amount0Desired === 0n || amount1Desired === 0n) throw new Error("Both token amounts must be greater than 0.");
        // If user provides in reverse order, map into pool order
        amount0Pool = matchesPool ? amount0Desired : amount1Desired;
        amount1Pool = matchesPool ? amount1Desired : amount0Desired;
      }

      const bal0 = (await publicClient.readContract({
        address: token0Pool,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      const bal1 = (await publicClient.readContract({
        address: token1Pool,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      if (bal0 < amount0Pool) {
        throw new Error(
          `Insufficient ${matchesPool ? sym0 : sym1} balance. Need ${formatUnits(amount0Pool, decimals0Pool)}, wallet has ${formatUnits(bal0, decimals0Pool)}.`
        );
      }
      if (bal1 < amount1Pool) {
        throw new Error(
          `Insufficient ${matchesPool ? sym1 : sym0} balance. Need ${formatUnits(amount1Pool, decimals1Pool)}, wallet has ${formatUnits(bal1, decimals1Pool)}.`
        );
      }

      setState((s) => ({ ...s, step: "approving" }));
      const allow0 = (await publicClient.readContract({
        address: token0Pool,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, pool],
      })) as bigint;
      if (allow0 < amount0Pool) {
        const approveHash = await activeWalletClient.writeContract({
          address: token0Pool,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [pool, amount0Pool],
          chain: polkadotHub,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }
      const allow1 = (await publicClient.readContract({
        address: token1Pool,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, pool],
      })) as bigint;
      if (allow1 < amount1Pool) {
        const approveHash = await activeWalletClient.writeContract({
          address: token1Pool,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [pool, amount1Pool],
          chain: polkadotHub,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      // Pool addLiquidity may consume less of one side to maintain ratio.
      // For this demo flow, keep mins at 0 to avoid false SlippageExceeded reverts.
      const min0 = 0n;
      const min1 = 0n;

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "addLiquidity",
        args: [amount0Pool, amount1Pool, min0, min1, address],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      return activeWalletClient.writeContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "addLiquidity",
        args: [amount0Pool, amount1Pool, min0, min1, address],
        chain: polkadotHub,
        account: address,
      });
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeRemoveLiquidity = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();

      const p = draft.params;
      const sym0 = normalizeSymbol(p.token0 || p.fromToken || "USDC");
      const sym1 = normalizeSymbol(p.token1 || p.toToken || "USDT");
      const pool = resolveAmmPool(sym0, sym1);
      if (!pool || isZeroAddress(pool)) {
        throw new Error(`AMM pool is not configured for ${sym0}/${sym1}.`);
      }
      const lpInput = String(p.lpAmount || p.amount || "").trim();
      const lpDecimals = 18;
      if (!lpInput) {
        throw new Error("Please specify how much liquidity to remove (e.g. 25%, 50%, 100%, or an LP amount).");
      }

      const lpBal = (await publicClient.readContract({
        address: pool,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      })) as bigint;
      let liquidity: bigint;
      if (/^(all|max)$/i.test(lpInput)) {
        liquidity = lpBal;
      } else if (lpInput.endsWith("%")) {
        const pct = Number(lpInput.slice(0, -1));
        if (!Number.isFinite(pct) || pct <= 0) {
          throw new Error("LP percentage must be greater than 0%.");
        }
        if (pct > 100) {
          throw new Error("LP percentage cannot exceed 100%.");
        }
        const bps = BigInt(Math.round(pct * 100));
        liquidity = (lpBal * bps) / 10000n;
      } else {
        const lpRaw = sanitizeAmount(lpInput, "0");
        liquidity = parseUnits(lpRaw, lpDecimals);
      }
      if (liquidity === 0n) throw new Error("LP amount must be greater than 0.");
      if (lpBal < liquidity) {
        throw new Error(
          `Insufficient LP balance. You have ${formatUnits(lpBal, lpDecimals)} LP, requested ${formatUnits(liquidity, lpDecimals)}.`
        );
      }

      // For demo: set min amounts to 0 by default.
      const min0 = 0n;
      const min1 = 0n;

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "removeLiquidity",
        args: [liquidity, min0, min1, address],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      return activeWalletClient.writeContract({
        address: pool,
        abi: DEFAI_AMM_POOL_ABI,
        functionName: "removeLiquidity",
        args: [liquidity, min0, min1, address],
        chain: polkadotHub,
        account: address,
      });
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeStake = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();

      const stakeSymbol = (draft.params.token || "USDC").toUpperCase();
      const stakingTokenAddr = resolveToken(stakeSymbol);
      const stakingVault = resolveStakingVault(stakeSymbol);
      if (!stakingTokenAddr || !stakingVault || isZeroAddress(stakingVault)) {
        throw new Error(`Staking vault is not configured for ${stakeSymbol}.`);
      }

      const amountRaw = sanitizeAmount(draft.params.amount, "0");
      const decimals = (await publicClient.readContract({
        address: stakingTokenAddr,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;
      const amount = parseUnits(amountRaw, decimals);

      setState((s) => ({ ...s, step: "approving" }));
      const allowance = (await publicClient.readContract({
        address: stakingTokenAddr,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, stakingVault],
      })) as bigint;

      if (allowance < amount) {
        const approveHash = await activeWalletClient.writeContract({
          address: stakingTokenAddr,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [stakingVault, amount],
          chain: polkadotHub,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: stakingVault,
        abi: DEFAI_STAKING_VAULT_ABI,
        functionName: "stake",
        args: [amount],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: stakingVault,
        abi: DEFAI_STAKING_VAULT_ABI,
        functionName: "stake",
        args: [amount],
        chain: polkadotHub,
        account: address,
      });

      return hash;
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeUnstake = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();

      const stakeSymbol = (draft.params.token || "USDC").toUpperCase();
      const stakingTokenAddr = resolveToken(stakeSymbol);
      const stakingVault = resolveStakingVault(stakeSymbol);
      if (!stakingTokenAddr || !stakingVault || isZeroAddress(stakingVault)) {
        throw new Error(`Staking vault is not configured for ${stakeSymbol}.`);
      }

      const amountRaw = sanitizeAmount(draft.params.amount, "0");
      const decimals = (await publicClient.readContract({
        address: stakingTokenAddr,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;
      const amount = parseUnits(amountRaw, decimals);

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: stakingVault,
        abi: DEFAI_STAKING_VAULT_ABI,
        functionName: "unstake",
        args: [amount],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: stakingVault,
        abi: DEFAI_STAKING_VAULT_ABI,
        functionName: "unstake",
        args: [amount],
        chain: polkadotHub,
        account: address,
      });

      return hash;
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeBridge = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();
      const sourceChainId = chainId ?? polkadotHub.id;
      if (sourceChainId !== polkadotHub.id && sourceChainId !== BASE_SEPOLIA_CHAIN_ID) {
        throw new Error("Switch wallet to Polkadot Hub or Base Sepolia to bridge.");
      }
      const isBaseSource = sourceChainId === BASE_SEPOLIA_CHAIN_ID;
      const sourceGateway = isBaseSource ? BASE_BRIDGE_GATEWAY : HUB_BRIDGE_GATEWAY;
      const sourceChain = isBaseSource ? baseSepolia : polkadotHub;
      const sourceClient = isBaseSource
        ? getPublicClient(wagmiConfig, { chainId: BASE_SEPOLIA_CHAIN_ID })
        : publicClient;
      if (!sourceClient) throw new Error("Could not initialize bridge client for the selected chain.");

      if (isZeroAddress(sourceGateway)) {
        throw new Error(
          `Bridge gateway is not configured for ${isBaseSource ? "Base Sepolia" : "Polkadot Hub Testnet"}.`
        );
      }

      const p = draft.params;
      const amountRaw = sanitizeAmount(p.amount, "0");
      const destinationChainId = parseDestinationChainId(p.toChain, sourceChainId);
      const recipient = address;
      const userNonce = BigInt(Date.now());
      const now = BigInt(Math.floor(Date.now() / 1000));
      const deadline = now + 20n * 60n;
      const secret = deriveBridgeSecret(address, userNonce, destinationChainId);
      const secretHash = keccak256(encodePacked(["bytes32"], [secret]));
      const symbol = normalizeSymbol(p.token || p.fromToken || "DOT");

      if (symbol === "DOT" || symbol === "ETH") {
        const amount = parseUnits(amountRaw, 18);

        setState((s) => ({ ...s, step: "simulating" }));
        await sourceClient.simulateContract({
          address: sourceGateway,
          abi: DEFAI_BRIDGE_GATEWAY_ABI,
          functionName: "bridgeNative",
          args: [destinationChainId, recipient, userNonce, deadline, secretHash],
          value: amount,
          account: address,
        } as any);

        setState((s) => ({ ...s, step: "awaiting-signature" }));
        const hash = await activeWalletClient.writeContract({
          address: sourceGateway,
          abi: DEFAI_BRIDGE_GATEWAY_ABI,
          functionName: "bridgeNative",
          args: [destinationChainId, recipient, userNonce, deadline, secretHash],
          value: amount,
          chain: sourceChain,
          account: address,
        } as any);
        return { hash, chainId: sourceChainId };
      }

      const tokenAddr = resolveBridgeToken(sourceChainId, symbol);
      if (!tokenAddr || isZeroAddress(tokenAddr)) {
        throw new Error(
          `Bridge token ${symbol} is not configured on ${isBaseSource ? "Base Sepolia" : "Polkadot Hub Testnet"}.`
        );
      }

      const decimals = (await sourceClient.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "decimals",
      } as any)) as number;
      const amount = parseUnits(amountRaw, decimals);
      const walletBalance = (await sourceClient.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [address],
      } as any)) as bigint;
      if (walletBalance < amount) {
        throw new Error(
          `Insufficient ${symbol} balance for bridge. Need ${formatUnits(amount, decimals)}, wallet has ${formatUnits(walletBalance, decimals)}.`
        );
      }

      setState((s) => ({ ...s, step: "approving" }));
      const allowance = (await sourceClient.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [address, sourceGateway],
      } as any)) as bigint;

      if (allowance < amount) {
        const approveHash = await activeWalletClient.writeContract({
          address: tokenAddr,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [sourceGateway, amount],
          chain: sourceChain,
          account: address,
        } as any);
        await sourceClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setState((s) => ({ ...s, step: "simulating" }));
      await sourceClient.simulateContract({
        address: sourceGateway,
        abi: DEFAI_BRIDGE_GATEWAY_ABI,
        functionName: "bridgeERC20",
        args: [tokenAddr, amount, destinationChainId, recipient, userNonce, deadline, secretHash],
        account: address,
      } as any);

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: sourceGateway,
        abi: DEFAI_BRIDGE_GATEWAY_ABI,
        functionName: "bridgeERC20",
        args: [tokenAddr, amount, destinationChainId, recipient, userNonce, deadline, secretHash],
        chain: sourceChain,
        account: address,
      } as any);
      return { hash, chainId: sourceChainId };
    },
    [address, chainId, publicClient, getActiveWalletClient]
  );

  const executeMint = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();
      if (isZeroAddress(HUB_ACCESS_PASS_NFT)) {
        throw new Error("NFT contract is not configured.");
      }

      const uri =
        (draft.params.uri && draft.params.uri.trim()) ||
        `ipfs://defai/access-pass/${address.toLowerCase()}/${Date.now()}.json`;

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: HUB_ACCESS_PASS_NFT,
        abi: DEFAI_ACCESS_PASS_NFT_ABI,
        functionName: "mint",
        args: [uri],
        account: address,
      } as any);

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: HUB_ACCESS_PASS_NFT,
        abi: DEFAI_ACCESS_PASS_NFT_ABI,
        functionName: "mint",
        args: [uri],
        chain: polkadotHub,
        account: address,
      } as any);
      return { hash, chainId: polkadotHub.id };
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeClaim = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();

      const symbol = normalizeSymbol(draft.params.token || "USDC");
      const tokenAddr = resolveToken(symbol);
      if (!tokenAddr) {
        throw new Error(`Unknown claim token: ${symbol}. Try USDC or USDT.`);
      }

      const amountRaw = sanitizeAmount(draft.params.amount, "200");
      const decimals = (await publicClient.readContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "decimals",
      })) as number;
      const amount = parseUnits(amountRaw, decimals);

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [address, amount],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      return activeWalletClient.writeContract({
        address: tokenAddr,
        abi: ERC20_ABI,
        functionName: "mint",
        args: [address, amount],
        chain: polkadotHub,
        account: address,
      });
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeLaunchpad = useCallback(
    async (draft: TransactionDraft) => {
      if (!address || !publicClient) {
        throw new Error("Wallet not connected");
      }
      const activeWalletClient = await getActiveWalletClient();
      if (isZeroAddress(HUB_TOKEN_FACTORY)) {
        throw new Error("Token factory is not configured.");
      }

      const rawName = (draft.params.tokenName || "My Token").trim();
      const rawSymbol = (draft.params.tokenSymbol || "MYT").trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
      const symbol = rawSymbol.slice(0, 10) || "MYT";
      const totalSupplyRaw = sanitizeAmount(draft.params.totalSupply, "1000000");
      const totalSupply = parseUnits(totalSupplyRaw, 18);
      const burnEnabledRaw = (draft.params.burnEnabled || draft.params.burnMechanism || "yes").toLowerCase();
      const burnEnabled = !["no", "false", "off", "0", "disabled"].includes(burnEnabledRaw);

      const parseBps = (v?: string, fallback = 0) => {
        if (!v) return fallback;
        const n = Number.parseInt(v.replace(/[^0-9]/g, ""), 10);
        return Number.isFinite(n) ? n : fallback;
      };

      const transferTaxBps = Math.max(0, Math.min(1000, parseBps(draft.params.tradingTaxBps, 0)));
      const taxBurnBps = Math.max(0, Math.min(10000, parseBps(draft.params.taxBurnBps, 0)));
      const recipientRaw = (draft.params.taxRecipient || "").trim();
      const ownerRaw = (draft.params.owner || address).trim();
      const initialRecipientRaw = (draft.params.initialRecipient || address).trim();
      const isAddress = (value: string) => /^0x[a-fA-F0-9]{40}$/.test(value);
      const isBurnKeyword = /\bburn\b|\bdead\b/i.test(recipientRaw);
      const explicitRecipient = isBurnKeyword
        ? BURN_ADDRESS
        : (isAddress(recipientRaw) ? (recipientRaw as Address) : null);
      const taxRecipient =
        transferTaxBps > 0
          ? explicitRecipient
          : ("0x0000000000000000000000000000000000000000" as Address);
      const owner = (isAddress(ownerRaw) ? ownerRaw : address) as Address;
      const initialRecipient = (isAddress(initialRecipientRaw) ? initialRecipientRaw : address) as Address;

      if (transferTaxBps > 0 && !taxRecipient) {
        throw new Error("Trading tax requires explicit destination: burn address or a wallet address.");
      }

      const launchParams = {
        name: rawName,
        symbol,
        initialSupply: totalSupply,
        owner,
        initialRecipient,
        burnEnabled,
        transferTaxBps,
        taxRecipient: (taxRecipient || "0x0000000000000000000000000000000000000000") as Address,
        taxBurnBps: transferTaxBps > 0 ? taxBurnBps : 0,
      };

      setState((s) => ({ ...s, step: "simulating" }));
      await publicClient.simulateContract({
        address: HUB_TOKEN_FACTORY,
        abi: DEFAI_TOKEN_FACTORY_ABI,
        functionName: "createToken",
        args: [launchParams],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: HUB_TOKEN_FACTORY,
        abi: DEFAI_TOKEN_FACTORY_ABI,
        functionName: "createToken",
        args: [launchParams],
        chain: polkadotHub,
        account: address,
      });

      return hash;
    },
    [address, publicClient, getActiveWalletClient]
  );

  const executeLend = useCallback(
    async (draft: TransactionDraft) => {
      // Demo lending executes on the same token vault rails as staking.
      return executeStake(draft);
    },
    [executeStake]
  );

  const executeUnlend = useCallback(
    async (draft: TransactionDraft) => {
      // Demo unlend executes on the same token vault rails as unstaking.
      return executeUnstake(draft);
    },
    [executeUnstake]
  );

  const execute = useCallback(
    async (draft: TransactionDraft): Promise<ExecutionResult> => {
      reset();
      let submittedHash: Hash | undefined;
      let submittedChainId: number | undefined;
      let swapDetails: ExecutionResult["swap"] | undefined;

      try {
        let hash: Hash;
        let txChainId = polkadotHub.id;

        switch (draft.intent) {
          case "swap":
            {
              const swapResult = await executeSwap(draft);
              hash = swapResult.hash;
              swapDetails = swapResult.swap;
            }
            break;
          case "addLiquidity":
            hash = await executeAddLiquidity(draft);
            break;
          case "removeLiquidity":
            hash = await executeRemoveLiquidity(draft);
            break;
          case "bridge":
            {
              const bridgeResult = await executeBridge(draft);
              hash = bridgeResult.hash;
              txChainId = bridgeResult.chainId;
            }
            break;
          case "stake":
            hash = await executeStake(draft);
            break;
          case "unstake":
            hash = await executeUnstake(draft);
            break;
          case "lend":
            hash = await executeLend(draft);
            break;
          case "unlend":
            hash = await executeUnlend(draft);
            break;
          case "claim":
            hash = await executeClaim(draft);
            break;
          case "mint":
            {
              const mintResult = await executeMint(draft);
              hash = mintResult.hash;
              txChainId = mintResult.chainId;
            }
            break;
          case "launchpad":
            hash = await executeLaunchpad(draft);
            break;
          default:
            toast.info("This action type doesn't require on-chain execution.");
            return { success: false, error: "This action is not executable." };
        }

        setState((s) => ({ ...s, step: "broadcasting", txHash: hash }));
        setState((s) => ({ ...s, step: "confirming", txHash: hash }));
        submittedHash = hash;
        submittedChainId = txChainId;
        const waitClient =
          txChainId === BASE_SEPOLIA_CHAIN_ID
            ? getPublicClient(wagmiConfig, { chainId: BASE_SEPOLIA_CHAIN_ID })
            : publicClient;
        if (!waitClient) {
          throw new Error("Unable to monitor this transaction receipt.");
        }
        const receipt = await waitClient.waitForTransactionReceipt({ hash, timeout: 600_000 });

        setState({
          step: "finalized",
          txHash: hash,
          blockNumber: receipt.blockNumber,
          error: null,
        });

        toast.success("Transaction finalized!");
        return {
          success: true,
          txHash: hash,
          blockNumber: receipt.blockNumber,
          chainId: txChainId,
          swap: swapDetails,
        };
      } catch (err: unknown) {
        const maybeErr = err as { shortMessage?: string; message?: string };
        let message = maybeErr?.shortMessage || maybeErr?.message || "Transaction failed";
        const timedOut = message.includes("Timed out while waiting for transaction");
        if (timedOut) {
          toast.info("Transaction submitted. Confirmation is taking longer than expected; check explorer with your tx hash.");
          return {
            success: true,
            txHash: submittedHash,
            chainId: submittedChainId ?? chainId,
            pending: true,
            swap: swapDetails,
          };
        }
        if (message.includes("0xe450d38c")) {
          message = "Insufficient token balance for this transaction amount. Claim/mint tokens first or reduce amount.";
        }
        if (message.includes("0x7865bb90")) {
          message = "Swap pair is not configured on-chain for this token direction.";
        }
        if (message.includes("0x09aa8c39")) {
          message = "Add/remove liquidity slippage check failed (pool ratio moved). Retry now; for demo, min constraints are relaxed.";
        }
        setState((s) => ({ ...s, step: "error", error: message }));
        toast.error(message);
        return { success: false, error: message };
      }
    },
    [
      reset,
      executeSwap,
      executeAddLiquidity,
      executeRemoveLiquidity,
      executeBridge,
      executeStake,
      executeUnstake,
      executeLend,
      executeUnlend,
      executeClaim,
      executeMint,
      executeLaunchpad,
      publicClient,
      chainId,
    ]
  );

  return { state, execute, reset };
}
