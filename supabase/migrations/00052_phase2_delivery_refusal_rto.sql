-- ============================================================================
-- Migration 00052: Phase 2.1 — Delivery refusal & return-to-origin lifecycle
-- ============================================================================
--
-- BUSINESS CASE:
--   In real COD ecommerce, 5–15% of out-for-delivery orders get refused at the
--   door (wrong address, customer unreachable, change of mind, package
--   damaged in transit, etc.). Today ShopNest has no flow for this — admin
--   has to manually fudge cancellations and the RTO logistics are invisible.
--
-- NEW STATES:
--   • delivery_refused      — customer rejected the package at the door
--   • return_to_origin      — package is on its way back to the warehouse
--
-- TRANSITIONS ADDED:
--   shipped              → delivery_refused
--   out_for_delivery     → delivery_refused
--   delivery_refused     → return_to_origin
--   delivery_refused     → cancelled        (skip RTO tracking, instant cancel)
--   return_to_origin     → cancelled        (warehouse received, restock done)
--
-- INVENTORY SEMANTICS:
--   Pre-delivery the unit is on the inventory ledger (quantity unchanged,
--   reserved += qty). On cancel, release_inventory_reservation frees the
--   reservation — no restock movement needed because commit_inventory_for_order
--   was never called (delivery never completed).
--
-- NEW RPCs:
--   • mark_delivery_refused(p_order_id, p_actor_id, p_reason)
--       Transitions out_for_delivery|shipped → delivery_refused, records
--       event with refusal reason, idempotent.
--
--   • mark_rto_in_transit(p_order_id, p_actor_id, p_tracking_note)
--       Transitions delivery_refused → return_to_origin, optional RTO tracking
--       note (no separate fulfillment row in v1).
--
--   • complete_rto(p_order_id, p_actor_id, p_notes)
--       Transitions delivery_refused|return_to_origin → cancelled. The cancel
--       transition auto-releases inventory reservation via the existing
--       update_order_status hook from migration 00050.
--
-- IDEMPOTENCY:
--   - Enum additions are append-only (Postgres requirement) — safe.
--   - State-machine update via CREATE OR REPLACE FUNCTION.
--   - Each new RPC is a CREATE OR REPLACE.
-- ============================================================================

-- ── 1. Append new order_status enum values ───────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.order_status'::regtype AND enumlabel='delivery_refused') THEN
    ALTER TYPE public.order_status ADD VALUE 'delivery_refused';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumtypid='public.order_status'::regtype AND enumlabel='return_to_origin') THEN
    ALTER TYPE public.order_status ADD VALUE 'return_to_origin';
  END IF;
END $$;
