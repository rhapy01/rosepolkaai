import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateNonce(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  for (const b of bytes) {
    result += chars[b % chars.length];
  }
  return result;
}

// Simple SIWE message parser
function parseSiweMessage(message: string) {
  const lines = message.split("\n");
  const address = lines[1]?.trim();
  const nonceMatch = message.match(/Nonce: (.+)/);
  const chainIdMatch = message.match(/Chain ID: (\d+)/);
  const uriMatch = message.match(/URI: (.+)/);
  return {
    address: address?.toLowerCase(),
    nonce: nonceMatch?.[1],
    chainId: chainIdMatch ? parseInt(chainIdMatch[1]) : undefined,
    uri: uriMatch?.[1],
  };
}

// Verify Ethereum signature using ecrecover via viem-compatible approach
async function verifySignature(message: string, signature: string, expectedAddress: string): Promise<boolean> {
  try {
    // Use eth_accounts style verification by importing from esm.sh
    const { verifyMessage } = await import("https://esm.sh/viem@2.31.3/utils");
    const valid = await verifyMessage({
      address: expectedAddress as `0x${string}`,
      message,
      signature: signature as `0x${string}`,
    });
    return valid;
  } catch (e) {
    console.error("Signature verification error:", e);
    return false;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  try {
    const { action, message, signature, address } = await req.json();

    if (action === "nonce") {
      const nonce = generateNonce();

      // Store nonce with expiry
      await supabase.from("siwe_nonces").insert({
        nonce,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });

      return new Response(JSON.stringify({ nonce }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "verify") {
      if (!message || !signature || !address) {
        return new Response(JSON.stringify({ error: "Missing fields" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Parse the SIWE message
      const parsed = parseSiweMessage(message);

      if (!parsed.nonce || !parsed.address) {
        return new Response(JSON.stringify({ error: "Invalid SIWE message" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check nonce exists and hasn't expired
      const { data: nonceData } = await supabase
        .from("siwe_nonces")
        .select("*")
        .eq("nonce", parsed.nonce)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();

      if (!nonceData) {
        return new Response(JSON.stringify({ error: "Invalid or expired nonce" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Delete used nonce
      await supabase.from("siwe_nonces").delete().eq("nonce", parsed.nonce);

      // Verify signature
      const isValid = await verifySignature(message, signature, address);
      if (!isValid) {
        return new Response(JSON.stringify({ error: "Invalid signature" }), {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Upsert profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .upsert(
          {
            wallet_address: address.toLowerCase(),
            display_name: `${address.slice(0, 6)}...${address.slice(-4)}`,
          },
          { onConflict: "wallet_address" }
        )
        .select()
        .single();

      if (profileError) {
        console.error("Profile error:", profileError);
        return new Response(JSON.stringify({ error: "Failed to create profile" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ profile, authenticated: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("SIWE auth error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
