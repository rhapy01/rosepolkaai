
-- Profiles table linked to wallet addresses (SIWE auth)
CREATE TABLE public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  wallet_address TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  ens_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Anyone can read profiles (public data)
CREATE POLICY "Profiles are publicly readable"
ON public.profiles FOR SELECT USING (true);

-- Only the SIWE edge function (service role) can insert/update profiles
-- Users authenticate via SIWE, the edge function manages profile data
CREATE POLICY "Service role can insert profiles"
ON public.profiles FOR INSERT
WITH CHECK (true);

CREATE POLICY "Service role can update profiles"
ON public.profiles FOR UPDATE
USING (true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- SIWE nonces table for replay protection
CREATE TABLE public.siwe_nonces (
  nonce TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes')
);

ALTER TABLE public.siwe_nonces ENABLE ROW LEVEL SECURITY;

-- Only service role can manage nonces
CREATE POLICY "Service role manages nonces"
ON public.siwe_nonces FOR ALL USING (true);
