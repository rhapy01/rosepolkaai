import { useState, useCallback } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits, formatUnits, keccak256, encodePacked, stringToHex, type Address, type Hash } from "viem";
import { getPublicClient, getWalletClient } from "@wagmi/core";
import { toast } from "sonner";
import { baseSepolia, config as wagmiConfig, polkadotHub } from "@/lib/wagmi-config";
import {
  ERC20_ABI,
  DEFAI_ACCESS_PASS_NFT_ABI,
  DEFAI_SIMPLE_SWAP_ABI,
  DEFAI_STAKING_VAULT_ABI,
  DEFAI_BRIDGE_GATEWAY_ABI,
  DEFAI_TOKEN_FACTORY_ABI,
  BASE_TOKENS,
  HUB_TOKENS,
  HUB_DEX_ROUTER,
  HUB_STAKING_VAULTS,
  HUB_ACCESS_PASS_NFT,
  HUB_TOKEN_FACTORY,
  HUB_BRIDGE_GATEWAY,
  BASE_BRIDGE_GATEWAY,
  BASE_SEPOLIA_CHAIN_ID,
} from "@/lib/contracts";
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

      if (isZeroAddress(HUB_DEX_ROUTER)) {
        throw new Error("Swap contract is not configured.");
      }

      const { params } = draft;
      const fromToken = resolveToken(params.fromToken);
      const toToken = resolveToken(params.toToken);
      const fromTokenSymbol = normalizeSymbol(params.fromToken);
      const toTokenSymbol = normalizeSymbol(params.toToken);
      const amountRaw = sanitizeAmount(params.amount, "0");
      const slippageBps = parseSlippageBps(params.slippage);
      if (!fromToken || !toToken) {
        throw new Error("Swap supports configured ERC20 pairs (USDC/USDT) for this demo.");
      }

      const configuredRate = (await publicClient.readContract({
        address: HUB_DEX_ROUTER,
        abi: DEFAI_SIMPLE_SWAP_ABI,
        functionName: "pairRate",
        args: [fromToken, toToken],
      })) as bigint;
      if (configuredRate === 0n) {
        throw new Error(
          `Swap pair not configured on-chain for ${fromTokenSymbol || "tokenIn"} -> ${toTokenSymbol || "tokenOut"}.`
        );
      }

      const fromDecimals = (await publicClient.readContract({
        address: fromToken,
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
        args: [address, HUB_DEX_ROUTER],
      })) as bigint;

      if (allowance < amountIn) {
        const approveHash = await activeWalletClient.writeContract({
          address: fromToken,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [HUB_DEX_ROUTER, amountIn],
          chain: polkadotHub,
          account: address,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
      }

      setState((s) => ({ ...s, step: "simulating" }));
      const expectedOut = (await publicClient.readContract({
        address: HUB_DEX_ROUTER,
        abi: DEFAI_SIMPLE_SWAP_ABI,
        functionName: "quote",
        args: [fromToken, toToken, amountIn],
      })) as bigint;
      const amountOutMin = amountOutMinFromSlippage(expectedOut, slippageBps);

      await publicClient.simulateContract({
        address: HUB_DEX_ROUTER,
        abi: DEFAI_SIMPLE_SWAP_ABI,
        functionName: "swapExactInput",
        args: [fromToken, toToken, amountIn, amountOutMin, address],
        account: address,
      });

      setState((s) => ({ ...s, step: "awaiting-signature" }));
      const hash = await activeWalletClient.writeContract({
        address: HUB_DEX_ROUTER,
        abi: DEFAI_SIMPLE_SWAP_ABI,
        functionName: "swapExactInput",
        args: [fromToken, toToken, amountIn, amountOutMin, address],
        chain: polkadotHub,
        account: address,
      });

      return hash;
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

      try {
        let hash: Hash;
        let txChainId = polkadotHub.id;

        switch (draft.intent) {
          case "swap":
            hash = await executeSwap(draft);
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
          };
        }
        if (message.includes("0xe450d38c")) {
          message = "Insufficient token balance for this transaction amount. Claim/mint tokens first or reduce amount.";
        }
        if (message.includes("0x7865bb90")) {
          message = "Swap pair is not configured on-chain for this token direction.";
        }
        setState((s) => ({ ...s, step: "error", error: message }));
        toast.error(message);
        return { success: false, error: message };
      }
    },
    [
      reset,
      executeSwap,
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
