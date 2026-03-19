
-- Fix overly permissive RLS: edge function uses service_role which bypasses RLS
-- So we only need restrictive policies for anon/authenticated access

DROP POLICY "Service role can insert profiles" ON public.profiles;
DROP POLICY "Service role can update profiles" ON public.profiles;
DROP POLICY "Service role manages nonces" ON public.siwe_nonces;

-- No anon/authenticated users should directly insert/update profiles (only via edge function)
-- No anon/authenticated users should access nonces table
CREATE POLICY "No direct profile inserts"
ON public.profiles FOR INSERT
WITH CHECK (false);

CREATE POLICY "No direct profile updates"
ON public.profiles FOR UPDATE
USING (false);

CREATE POLICY "No direct nonce access"
ON public.siwe_nonces FOR ALL
USING (false);
