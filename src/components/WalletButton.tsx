import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useWalletProfile } from "@/hooks/useWalletProfile";
import { Button } from "@/components/ui/button";
import { Wallet, LogOut, User } from "lucide-react";
import { toast } from "sonner";

export default function WalletButton() {
  const { isAuthenticated, profile, signIn, signOut, isLoading } = useWalletProfile();

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        const connected = mounted && account && chain;

        if (!connected) {
          return (
            <Button
              variant="outline"
              size="sm"
              onClick={openConnectModal}
              className="gap-2 text-xs"
            >
              <Wallet className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Connect Wallet</span>
              <span className="sm:hidden">Connect</span>
            </Button>
          );
        }

        if (!isAuthenticated) {
          return (
            <Button
              variant="default"
              size="sm"
              onClick={async () => {
                const ok = await signIn();
                if (ok) toast.success("Signed in with Ethereum!");
                else toast.error("Sign-in failed");
              }}
              disabled={isLoading}
              className="gap-2 text-xs"
            >
              <User className="w-3.5 h-3.5" />
              {isLoading ? "Signing..." : "Sign In"}
            </Button>
          );
        }

        return (
          <div className="flex items-center gap-2">
            <button
              onClick={openChainModal}
              className="text-[10px] font-mono text-muted-foreground bg-secondary px-2 py-1 rounded-lg hover:bg-accent transition-colors"
            >
              {chain.name}
            </button>
            <div className="flex items-center gap-1.5 bg-secondary rounded-lg px-2 py-1">
              <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center">
                <User className="w-3 h-3 text-primary" />
              </div>
              <span className="text-xs font-mono text-foreground">
                {profile?.display_name || account.displayName}
              </span>
            </div>
            <button
              onClick={() => {
                signOut();
                toast("Signed out");
              }}
              className="text-muted-foreground hover:text-foreground transition-colors p-1"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
