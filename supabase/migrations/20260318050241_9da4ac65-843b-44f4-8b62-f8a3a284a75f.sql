
-- User roles for admin
CREATE TYPE public.app_role AS ENUM ('admin', 'moderator', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

-- Transaction history
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  intent TEXT NOT NULL,
  summary TEXT NOT NULL,
  params JSONB NOT NULL DEFAULT '{}',
  tx_hash TEXT,
  block_number BIGINT,
  status TEXT NOT NULL DEFAULT 'pending',
  platform_fee TEXT,
  points_earned INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own transactions"
  ON public.transactions FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Users can insert own transactions"
  ON public.transactions FOR INSERT
  TO public
  WITH CHECK (true);

CREATE POLICY "Users can update own transactions"
  ON public.transactions FOR UPDATE
  TO public
  USING (true);

-- Points ledger
CREATE TABLE public.points_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address TEXT NOT NULL,
  points INTEGER NOT NULL,
  reason TEXT NOT NULL,
  tx_id UUID REFERENCES public.transactions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.points_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Points are publicly readable"
  ON public.points_ledger FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Points can be inserted"
  ON public.points_ledger FOR INSERT
  TO public
  WITH CHECK (true);

-- Whitelisted contracts (admin managed)
CREATE TABLE public.whitelisted_contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'polkadot-hub',
  category TEXT NOT NULL,
  protocol TEXT,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.whitelisted_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Whitelisted contracts are publicly readable"
  ON public.whitelisted_contracts FOR SELECT
  TO public
  USING (true);

CREATE POLICY "Only admins can insert contracts"
  ON public.whitelisted_contracts FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can update contracts"
  ON public.whitelisted_contracts FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Only admins can delete contracts"
  ON public.whitelisted_contracts FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- User roles RLS
CREATE POLICY "Users can view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Leaderboard view function
CREATE OR REPLACE FUNCTION public.get_leaderboard(limit_count INTEGER DEFAULT 50)
RETURNS TABLE(wallet_address TEXT, total_points BIGINT, tx_count BIGINT, rank BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    pl.wallet_address,
    SUM(pl.points)::BIGINT as total_points,
    COUNT(DISTINCT pl.tx_id)::BIGINT as tx_count,
    ROW_NUMBER() OVER (ORDER BY SUM(pl.points) DESC)::BIGINT as rank
  FROM public.points_ledger pl
  GROUP BY pl.wallet_address
  ORDER BY total_points DESC
  LIMIT limit_count
$$;

-- Get user points
CREATE OR REPLACE FUNCTION public.get_user_points(wallet TEXT)
RETURNS TABLE(total_points BIGINT, rank BIGINT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT total_points, rank FROM (
    SELECT 
      pl.wallet_address,
      SUM(pl.points)::BIGINT as total_points,
      ROW_NUMBER() OVER (ORDER BY SUM(pl.points) DESC)::BIGINT as rank
    FROM public.points_ledger pl
    GROUP BY pl.wallet_address
  ) sub
  WHERE sub.wallet_address = wallet
$$;

-- Enable realtime for transactions
ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.points_ledger;
