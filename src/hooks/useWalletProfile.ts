import { useState, useEffect, useCallback } from "react";
import { useAccount } from "wagmi";
import { supabase } from "@/integrations/supabase/client";

interface WalletProfile {
  id: string;
  wallet_address: string;
  display_name: string | null;
  avatar_url: string | null;
  ens_name: string | null;
}

export function useWalletProfile() {
  const { address, isConnected } = useAccount();
  const [profile, setProfile] = useState<WalletProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Fetch profile when wallet connects
  useEffect(() => {
    if (!address || !isConnected) {
      setProfile(null);
      setIsAuthenticated(false);
      return;
    }

    const fetchProfile = async () => {
      setIsLoading(true);
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("wallet_address", address.toLowerCase())
        .maybeSingle();

      if (data) {
        setProfile(data as WalletProfile);
        setIsAuthenticated(true);
      }
      setIsLoading(false);
    };

    fetchProfile();
  }, [address, isConnected]);

  const signIn = useCallback(async () => {
    if (!address) return false;

    try {
      setIsLoading(true);

      // Get nonce from edge function
      const { data: nonceData, error: nonceError } = await supabase.functions.invoke("siwe-auth", {
        body: { action: "nonce" },
      });

      if (nonceError || !nonceData?.nonce) {
        console.error("Failed to get nonce:", nonceError);
        return false;
      }

      // Create SIWE message
      const domain = window.location.host;
      const origin = window.location.origin;
      const message = [
        `${domain} wants you to sign in with your Ethereum account:`,
        address,
        "",
        "Sign in to DeFAI on Polkadot Hub",
        "",
        `URI: ${origin}`,
        `Version: 1`,
        `Chain ID: 420420421`,
        `Nonce: ${nonceData.nonce}`,
        `Issued At: ${new Date().toISOString()}`,
      ].join("\n");

      // Request signature via wagmi
      const { signMessage } = await import("@wagmi/core");
      const { config } = await import("@/lib/wagmi-config");
      const signature = await signMessage(config, { account: address, message });

      // Verify with edge function
      const { data: authData, error: authError } = await supabase.functions.invoke("siwe-auth", {
        body: {
          action: "verify",
          message,
          signature,
          address: address.toLowerCase(),
        },
      });

      if (authError || !authData?.profile) {
        console.error("SIWE verification failed:", authError);
        return false;
      }

      setProfile(authData.profile as WalletProfile);
      setIsAuthenticated(true);
      return true;
    } catch (err) {
      console.error("Sign in error:", err);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [address]);

  const signOut = useCallback(() => {
    setProfile(null);
    setIsAuthenticated(false);
  }, []);

  return {
    profile,
    isLoading,
    isAuthenticated,
    isConnected,
    address,
    signIn,
    signOut,
  };
}
