-- ============================================================================
-- Migration 00069: Per-country payment-method configuration
-- ============================================================================
--
-- PROBLEM:
--   Checkout currently hardcodes "Cash on Delivery" + "Credit / Debit Card
--   (Stripe)" radios. Whether COD is on/off was implicit via
--   REGION_CONFIGS.codMaxAmount (null = disabled). No way for ops to change
--   labels or add/remove methods per region without a deploy.
--
-- DESIGN:
--   Table `country_payment_methods`:
--     (country_code, method) PK pair.
--     is_enabled  — toggleable from admin UI without deploy.
--     label       — what the customer sees at checkout (per-country).
--     description — sub-label / explainer.
--     sort_order  — display order at checkout.
--
--   Seed: every country gets one row per available method (cod, stripe).
--   Initial enabled state mirrors current REGION_CONFIGS.codMaxAmount:
--     - IN and AE: cod enabled
--     - All others: cod disabled
--     - Stripe enabled everywhere
--
--   Going forward this table is the SOURCE OF TRUTH for which methods are
--   shown at checkout. The region-config codMaxAmount is now the AMOUNT CAP
--   only — it no longer controls on/off.
--
-- IDEMPOTENCY:
--   CREATE TABLE IF NOT EXISTS + ON CONFLICT DO NOTHING on seed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.country_payment_methods (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text NOT NULL,
  method       text NOT NULL,
  is_enabled   boolean NOT NULL DEFAULT true,
  label        text NOT NULL,
  description  text,
  sort_order   integer NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT country_payment_methods_country_method_key
    UNIQUE (country_code, method),
  CONSTRAINT chk_country_payment_methods_method
    CHECK (method IN ('cod', 'stripe', 'razorpay'))
);

CREATE INDEX IF NOT EXISTS idx_country_payment_methods_country
  ON public.country_payment_methods (country_code, is_enabled, sort_order);

-- updated_at trigger
DROP TRIGGER IF EXISTS trg_country_payment_methods_updated_at
  ON public.country_payment_methods;
CREATE TRIGGER trg_country_payment_methods_updated_at
  BEFORE UPDATE ON public.country_payment_methods
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

-- ── RLS — public read (storefront needs the list), admin write ──────────────
ALTER TABLE public.country_payment_methods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read payment methods" ON public.country_payment_methods;
CREATE POLICY "Public read payment methods"
  ON public.country_payment_methods
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Admins manage payment methods" ON public.country_payment_methods;
CREATE POLICY "Admins manage payment methods"
  ON public.country_payment_methods
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ── Seed defaults ────────────────────────────────────────────────────────────
-- Stripe enabled everywhere
INSERT INTO public.country_payment_methods (country_code, method, is_enabled, label, description, sort_order)
VALUES
  ('US','stripe',true,'Credit / Debit Card','Pay securely with your card.',10),
  ('UK','stripe',true,'Credit / Debit Card','Pay securely with your card.',10),
  ('DE','stripe',true,'Credit / Debit Card','Pay securely with your card.',10),
  ('FR','stripe',true,'Carte bancaire','Paiement sécurisé par carte.',10),
  ('IT','stripe',true,'Carta di credito','Pagamento sicuro con carta.',10),
  ('ES','stripe',true,'Tarjeta de crédito','Pago seguro con tarjeta.',10),
  ('IN','stripe',true,'Credit / Debit Card','Pay securely with your card.',10),
  ('AE','stripe',true,'Credit / Debit Card','Pay securely with your card.',10)
ON CONFLICT (country_code, method) DO NOTHING;

-- COD: enabled where region config previously had codMaxAmount > 0
INSERT INTO public.country_payment_methods (country_code, method, is_enabled, label, description, sort_order)
VALUES
  ('IN','cod',true,'Cash on Delivery','Pay in cash when your order arrives.',1),
  ('AE','cod',true,'Cash on Delivery','Pay in cash when your order arrives.',1),
  ('US','cod',false,'Cash on Delivery','Pay in cash when your order arrives.',1),
  ('UK','cod',false,'Cash on Delivery','Pay in cash when your order arrives.',1),
  ('DE','cod',false,'Cash on Delivery','Pay in cash when your order arrives.',1),
  ('FR','cod',false,'Paiement à la livraison','Payez en espèces à la livraison.',1),
  ('IT','cod',false,'Pagamento alla consegna','Pagamento in contanti alla consegna.',1),
  ('ES','cod',false,'Pago contra reembolso','Pague en efectivo a la entrega.',1)
ON CONFLICT (country_code, method) DO NOTHING;
