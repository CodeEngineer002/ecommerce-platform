-- ============================================================================
-- Migration 00047: Tighten order_events INSERT policy
-- ============================================================================
--
-- VULNERABILITY (Phase 0 audit 2026-05-23):
--   `public.order_events` had this INSERT policy:
--
--     CREATE POLICY "System insert order events"
--       ON public.order_events
--       FOR INSERT
--       WITH CHECK (true);
--
--   Combined with the INSERT grant Supabase assigns to `authenticated`, this
--   means any logged-in user could `POST /rest/v1/order_events` with an
--   arbitrary `order_id` and `event_type`, and the row would be accepted.
--
--   Attack surface:
--     • Fake "delivered" / "refund processed" / "cod_collected" events on
--       someone else's order to confuse the admin timeline.
--     • Spam the admin order-detail page with thousands of forged events.
--     • Insert events whose `metadata` jsonb gets rendered downstream and
--       carries malicious content.
--
-- DECISION:
--   All code that writes order_events does so through the admin/server API
--   using `createServiceClient()` (verified: orders/create, admin orders
--   notes, admin status updates, every RPC). Customers never insert events
--   directly. So we replace the open INSERT policy with a service-role-only
--   policy. This is consistent with how `payment_events` and
--   `tracking_events` are already gated.
-- ============================================================================

-- Drop both the old (vulnerable) policy and the new one to make this
-- migration idempotent — safe to re-run if a previous apply was partial.
DROP POLICY IF EXISTS "System insert order events"        ON public.order_events;
DROP POLICY IF EXISTS "Service role inserts order events" ON public.order_events;

CREATE POLICY "Service role inserts order events"
  ON public.order_events
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
