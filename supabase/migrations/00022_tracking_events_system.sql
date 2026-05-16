-- ============================================================
-- Migration: 00022_tracking_events_system
-- Purpose  : Enterprise-level shipment tracking
--
-- Adds:
--   1. tracking_events  — immutable carrier event log per fulfillment
--   2. carriers         — supported carrier registry
--   3. carrier_webhook_secrets — per-carrier HMAC secrets for webhook auth
--   4. append_tracking_event() — safe append + order status progression
--   5. auto_create_fulfillment_on_ship() — trigger: when order → shipped,
--      auto-create fulfillment row so manual step is not required
-- ============================================================

-- ── 1. carriers registry ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carriers (
  id            text        PRIMARY KEY,            -- 'delhivery', 'bluedart', 'shiprocket', 'fedex', 'generic'
  name          text        NOT NULL,
  tracking_url_template text,                        -- e.g. 'https://track.delhivery.com/?search={tracking_number}'
  logo_url      text,
  is_active     boolean     NOT NULL DEFAULT true,
  webhook_event_map jsonb   NOT NULL DEFAULT '{}',   -- maps carrier status codes → internal status
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Seed common carriers
INSERT INTO public.carriers (id, name, tracking_url_template, webhook_event_map) VALUES
  ('delhivery', 'Delhivery',
   'https://www.delhivery.com/track/package/{tracking_number}',
   '{"Manifested":"processing","In Transit":"shipped","Out For Delivery":"out_for_delivery","Delivered":"delivered","RTO Initiated":"failed","RTO Delivered":"failed"}'
  ),
  ('bluedart', 'Blue Dart',
   'https://www.bluedart.com/web/guest/trackdartship?trackfor={tracking_number}',
   '{"Shipment Booked":"processing","In Transit":"shipped","With Delivery Courier":"out_for_delivery","Delivered":"delivered","Undelivered":"failed"}'
  ),
  ('shiprocket', 'Shiprocket',
   'https://shiprocket.co/tracking/{tracking_number}',
   '{"NEW":"processing","PICKUP PENDING":"processing","IN TRANSIT":"shipped","OUT FOR DELIVERY":"out_for_delivery","DELIVERED":"delivered","UNDELIVERED":"failed","RTO INITIATED":"failed"}'
  ),
  ('fedex', 'FedEx',
   'https://www.fedex.com/apps/fedextrack/?tracknumbers={tracking_number}',
   '{"OC":"processing","PU":"processing","IT":"shipped","OD":"out_for_delivery","DL":"delivered","DE":"failed"}'
  ),
  ('dtdc', 'DTDC',
   'https://www.dtdc.in/trace.asp?Cnno={tracking_number}',
   '{"Booked":"processing","In Transit":"shipped","Out For Delivery":"out_for_delivery","Delivered":"delivered"}'
  ),
  ('generic', 'Other Carrier', NULL, '{}')
ON CONFLICT (id) DO NOTHING;

-- ── 2. carrier_webhook_secrets ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.carrier_webhook_secrets (
  carrier_id  text        PRIMARY KEY REFERENCES public.carriers(id),
  secret      text        NOT NULL,               -- HMAC secret for signature validation
  header_name text        NOT NULL DEFAULT 'x-webhook-signature',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.carrier_webhook_secrets ENABLE ROW LEVEL SECURITY;
-- Only service_role can read secrets — never expose to client
CREATE POLICY "Service role only" ON public.carrier_webhook_secrets
  FOR ALL USING (auth.role() = 'service_role');

-- ── 3. tracking_events ────────────────────────────────────────────────────────
-- Immutable append-only log of carrier tracking milestones.
-- Each row = one carrier event (scan, status change, etc.)
CREATE TABLE IF NOT EXISTS public.tracking_events (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  fulfillment_id  uuid        NOT NULL REFERENCES public.order_fulfillments(id) ON DELETE CASCADE,
  order_id        uuid        NOT NULL REFERENCES public.orders(id)             ON DELETE CASCADE,

  -- Carrier-reported data
  carrier_id      text        REFERENCES public.carriers(id),
  carrier_status  text        NOT NULL,             -- raw status from carrier (e.g. "Out For Delivery")
  internal_status text        NOT NULL,             -- mapped to our enum: shipped/out_for_delivery/delivered/failed
  location        text,                             -- city/hub name
  description     text,                             -- human-readable description
  event_time      timestamptz NOT NULL DEFAULT now(), -- carrier-reported event timestamp

  -- Source of the event
  source          text        NOT NULL DEFAULT 'manual',  -- 'manual' | 'webhook' | 'polling' | 'admin'
  raw_payload     jsonb       DEFAULT '{}',          -- full carrier webhook payload for audit

  -- Deduplication: prevents the same carrier event from being inserted twice
  carrier_event_id text,                             -- carrier's own event ID if available
  UNIQUE NULLS NOT DISTINCT (fulfillment_id, carrier_event_id),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tracking_events_fulfillment_id ON public.tracking_events(fulfillment_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_order_id       ON public.tracking_events(order_id);
CREATE INDEX IF NOT EXISTS idx_tracking_events_event_time     ON public.tracking_events(event_time DESC);

ALTER TABLE public.tracking_events ENABLE ROW LEVEL SECURITY;

-- Customers can view their own order's tracking events
CREATE POLICY "Users view own tracking events"
  ON public.tracking_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.orders
      WHERE id = order_id AND user_id = auth.uid()
    )
  );

-- Admins can view all
CREATE POLICY "Admins view tracking events"
  ON public.tracking_events FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );

-- Only service_role inserts (all inserts go through append_tracking_event)
CREATE POLICY "Service role manages tracking events"
  ON public.tracking_events FOR ALL
  USING (auth.role() = 'service_role');

-- ── 4. append_tracking_event() ───────────────────────────────────────────────
-- Atomically:
--   a) Inserts a tracking_event row
--   b) Updates order_fulfillments.status if new status is a progression
--   c) Updates order.status if the tracking event implies a transition
--      (e.g. delivered → order becomes delivered)
--   d) Updates fulfillment timestamps (shipped_at, delivered_at)
--
-- Idempotent via carrier_event_id uniqueness — safe to call from webhooks.

CREATE OR REPLACE FUNCTION public.append_tracking_event(
  p_fulfillment_id  uuid,
  p_carrier_status  text,
  p_internal_status text,
  p_location        text    DEFAULT NULL,
  p_description     text    DEFAULT NULL,
  p_event_time      timestamptz DEFAULT now(),
  p_source          text    DEFAULT 'manual',
  p_raw_payload     jsonb   DEFAULT '{}',
  p_carrier_event_id text   DEFAULT NULL
)
RETURNS uuid  -- returns new tracking_event id, or existing id if duplicate
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_fulfillment   record;
  v_order         record;
  v_event_id      uuid;
  v_status_rank   int;
  v_current_rank  int;

  -- Status rank for progression checks (higher = later in lifecycle)
  v_rank_map      jsonb := '{
    "processing": 1,
    "packed": 2,
    "shipped": 3,
    "out_for_delivery": 4,
    "delivered": 5,
    "failed": 6
  }';
BEGIN
  -- Idempotency: if this carrier_event_id already recorded, return existing
  IF p_carrier_event_id IS NOT NULL THEN
    SELECT id INTO v_event_id
    FROM public.tracking_events
    WHERE fulfillment_id = p_fulfillment_id
      AND carrier_event_id = p_carrier_event_id;

    IF FOUND THEN
      RETURN v_event_id;
    END IF;
  END IF;

  -- Fetch fulfillment + carrier
  SELECT f.*, c.id as carrier_id
  INTO v_fulfillment
  FROM public.order_fulfillments f
  LEFT JOIN public.carriers c ON c.id = f.carrier
  WHERE f.id = p_fulfillment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Fulfillment not found: %', p_fulfillment_id;
  END IF;

  -- Fetch order
  SELECT id, status INTO v_order
  FROM public.orders
  WHERE id = v_fulfillment.order_id
  FOR UPDATE;

  -- Insert tracking event
  INSERT INTO public.tracking_events (
    fulfillment_id, order_id, carrier_id, carrier_status, internal_status,
    location, description, event_time, source, raw_payload, carrier_event_id
  ) VALUES (
    p_fulfillment_id,
    v_fulfillment.order_id,
    v_fulfillment.carrier,
    p_carrier_status,
    p_internal_status,
    p_location,
    p_description,
    p_event_time,
    p_source,
    p_raw_payload,
    p_carrier_event_id
  )
  RETURNING id INTO v_event_id;

  -- Compute ranks for progression check
  v_status_rank  := COALESCE((v_rank_map ->> p_internal_status)::int, 0);
  v_current_rank := COALESCE((v_rank_map ->> v_fulfillment.status)::int, 0);

  -- Only progress fulfillment status forward (never go backward)
  IF v_status_rank > v_current_rank THEN
    UPDATE public.order_fulfillments
    SET status     = p_internal_status,
        shipped_at = CASE WHEN p_internal_status = 'shipped'   AND shipped_at   IS NULL THEN p_event_time ELSE shipped_at   END,
        delivered_at= CASE WHEN p_internal_status = 'delivered' AND delivered_at IS NULL THEN p_event_time ELSE delivered_at END,
        updated_at = now()
    WHERE id = p_fulfillment_id;

    -- Auto-progress order status to match fulfillment milestone
    -- Map fulfillment status → order status
    DECLARE
      v_new_order_status text;
      v_order_rank_map jsonb := '{
        "processing": 3,
        "processing_order": 3,
        "packed": 4,
        "shipped": 6,
        "out_for_delivery": 7,
        "delivered": 8
      }';
      v_order_status_rank int;
      v_current_order_rank int;
    BEGIN
      v_new_order_status := CASE p_internal_status
        WHEN 'shipped'           THEN 'shipped'
        WHEN 'out_for_delivery'  THEN 'out_for_delivery'
        WHEN 'delivered'         THEN 'delivered'
        ELSE NULL
      END;

      IF v_new_order_status IS NOT NULL THEN
        v_order_status_rank   := COALESCE((v_order_rank_map ->> v_new_order_status)::int, 0);
        v_current_order_rank  := COALESCE((v_order_rank_map ->> v_order.status)::int, 0);

        IF v_order_status_rank > v_current_order_rank THEN
          -- Record in order_status_history
          INSERT INTO public.order_status_history (order_id, old_status, new_status, reason, changed_by)
          VALUES (
            v_order.id,
            v_order.status,
            v_new_order_status,
            'Auto-updated from carrier tracking event: ' || p_carrier_status,
            NULL  -- system actor
          );

          UPDATE public.orders
          SET status     = v_new_order_status,
              updated_at = now()
          WHERE id = v_order.id;
        END IF;
      END IF;
    END;
  END IF;

  RETURN v_event_id;
END;
$$;

-- ── 5. auto_create_fulfillment_on_ship() ─────────────────────────────────────
-- Trigger function: when order status changes to 'shipped' and no fulfillment
-- exists yet, auto-create one so admin is not blocked.

CREATE OR REPLACE FUNCTION public.auto_create_fulfillment_on_ship()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only act when transitioning INTO 'shipped'
  IF NEW.status = 'shipped' AND (OLD.status IS NULL OR OLD.status != 'shipped') THEN
    -- Only create if no fulfillment exists
    IF NOT EXISTS (
      SELECT 1 FROM public.order_fulfillments
      WHERE order_id = NEW.id
    ) THEN
      INSERT INTO public.order_fulfillments (
        order_id, status, created_by, shipped_at
      ) VALUES (
        NEW.id, 'shipped', NEW.user_id, now()
      );
    ELSE
      -- Fulfillment exists — update its status to shipped if still processing/packed
      UPDATE public.order_fulfillments
      SET status     = 'shipped',
          shipped_at = COALESCE(shipped_at, now()),
          updated_at = now()
      WHERE order_id = NEW.id
        AND status IN ('processing', 'packed')
        AND id = (
          SELECT id FROM public.order_fulfillments
          WHERE order_id = NEW.id
          ORDER BY created_at DESC
          LIMIT 1
        );
    END IF;
  END IF;

  -- Auto-update fulfillment to out_for_delivery
  IF NEW.status = 'out_for_delivery' AND (OLD.status IS NULL OR OLD.status != 'out_for_delivery') THEN
    UPDATE public.order_fulfillments
    SET status     = 'out_for_delivery',
        updated_at = now()
    WHERE order_id = NEW.id
      AND status IN ('processing', 'packed', 'shipped')
      AND id = (
        SELECT id FROM public.order_fulfillments
        WHERE order_id = NEW.id
        ORDER BY created_at DESC
        LIMIT 1
      );
  END IF;

  -- Auto-update fulfillment to delivered
  IF NEW.status = 'delivered' AND (OLD.status IS NULL OR OLD.status != 'delivered') THEN
    UPDATE public.order_fulfillments
    SET status       = 'delivered',
        delivered_at = COALESCE(delivered_at, now()),
        updated_at   = now()
    WHERE order_id = NEW.id
      AND id = (
        SELECT id FROM public.order_fulfillments
        WHERE order_id = NEW.id
        ORDER BY created_at DESC
        LIMIT 1
      );
  END IF;

  RETURN NEW;
END;
$$;

-- Attach trigger to orders table
DROP TRIGGER IF EXISTS trg_auto_fulfillment_on_ship ON public.orders;
CREATE TRIGGER trg_auto_fulfillment_on_ship
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_create_fulfillment_on_ship();

-- ── 6. Permissions ────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION public.append_tracking_event FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.append_tracking_event TO service_role;

REVOKE EXECUTE ON FUNCTION public.auto_create_fulfillment_on_ship FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.auto_create_fulfillment_on_ship TO service_role;

-- ── 7. Comments ───────────────────────────────────────────────────────────────
COMMENT ON TABLE  public.tracking_events IS
  'Immutable carrier tracking event log. Append-only. Never delete rows.';
COMMENT ON TABLE  public.carriers IS
  'Supported shipping carrier registry with webhook event mappings.';
COMMENT ON FUNCTION public.append_tracking_event IS
  'Idempotent: append carrier tracking event, progress fulfillment/order status forward. Called by carrier webhooks and admin manual updates.';
COMMENT ON FUNCTION public.auto_create_fulfillment_on_ship IS
  'Trigger: auto-creates/updates fulfillment record when order moves to shipped/out_for_delivery/delivered.';
