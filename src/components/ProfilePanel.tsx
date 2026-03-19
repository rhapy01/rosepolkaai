import { useWalletProfile } from "@/hooks/useWalletProfile";
import { useAccount, useBalance } from "wagmi";
import { polkadotHub } from "@/lib/wagmi-config";
import { User, Copy, ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ConnectButton } from "@rainbow-me/rainbowkit";

export default function ProfilePanel() {
  const { profile, isAuthenticated, signIn, isLoading } = useWalletProfile();
  const { address, isConnected } = useAccount();
  const { data: balance } = useBalance({
    address,
    chainId: polkadotHub.id,
  });

  if (!isConnected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#171722] flex items-center justify-center mb-4">
          <Wallet className="w-8 h-8 text-white/70" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Connect Your Wallet</h2>
        <p className="text-sm text-white/60 mb-4 max-w-sm">
          Connect MetaMask or any EVM wallet to interact with Polkadot Hub
        </p>
        <ConnectButton />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[#171722] flex items-center justify-center mb-4">
          <User className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-lg font-semibold text-white mb-2">Sign In</h2>
        <p className="text-sm text-white/60 mb-4 max-w-sm">
          Sign a message to verify ownership of your wallet and access your DeFAI profile
        </p>
        <Button onClick={signIn} disabled={isLoading} className="gap-2">
          <User className="w-4 h-4" />
          {isLoading ? "Signing..." : "Sign In"}
        </Button>
      </div>
    );
  }

  const copyAddress = () => {
    if (address) {
      navigator.clipboard.writeText(address);
      toast.success("Address copied!");
    }
  };

  return (
    <div className="flex-1 p-4 sm:p-6 max-w-lg mx-auto w-full">
      <div className="rounded-2xl border border-white/10 bg-[#0f0f15] p-6 space-y-6 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
        {/* Avatar + name */}
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-[#171722] flex items-center justify-center">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">
              {profile?.display_name || "Anonymous"}
            </h2>
            {profile?.ens_name && (
              <p className="text-xs text-white/60">{profile.ens_name}</p>
            )}
          </div>
        </div>

        {/* Address */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-white/55">Wallet Address</p>
          <div className="flex items-center gap-2">
            <p className="text-xs font-mono text-white truncate">{address}</p>
            <button onClick={copyAddress} className="text-white/45 hover:text-white/80 transition-colors shrink-0">
              <Copy className="w-3.5 h-3.5" />
            </button>
            <a
              href={`https://blockscout-passet-hub.parity-testnet.parity.io/address/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/45 hover:text-white/80 transition-colors shrink-0"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Balance */}
        <div className="space-y-1">
          <p className="text-[10px] uppercase tracking-widest text-white/55">Balance on Hub</p>
          <p className="text-xl font-mono font-semibold text-white">
            {balance ? `${(Number(balance.value) / 10 ** balance.decimals).toFixed(4)} ${balance.symbol}` : "Loading..."}
          </p>
        </div>

        {/* Chain info */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
            <p className="text-[9px] text-white/55 uppercase">Chain</p>
            <p className="text-sm font-mono font-semibold text-white">Polkadot Hub</p>
          </div>
          <div className="bg-[#171722] border border-white/10 rounded-lg p-3">
            <p className="text-[9px] text-white/55 uppercase">Chain ID</p>
            <p className="text-sm font-mono font-semibold text-white">420420421</p>
          </div>
        </div>
      </div>
    </div>
  );
}
