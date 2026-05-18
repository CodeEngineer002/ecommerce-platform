-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: 00030_fix_approve_reject_return
-- Purpose:   Fix approve_return and reject_return functions: cast the target
--            status text variable to public.order_status before passing it to
--            update_order_status, which caused a "function does not exist" error
--            because PostgreSQL could not find an overload for (uuid, text, uuid, text).
-- ══════════════════════════════════════════════════════════════════════════════

-- ── approve_return (fixed) ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.approve_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_note      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return        RECORD;
  v_target_status public.order_status;
BEGIN
  SELECT id, order_id, status, request_type INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Request is not in requested state (current: %)', v_return.status
      USING ERRCODE = 'P0006';
  END IF;

  -- Branch: replacement → replacement_approved, return → return_approved
  v_target_status := CASE COALESCE(v_return.request_type, 'return')
    WHEN 'replacement' THEN 'replacement_approved'::public.order_status
    ELSE                    'return_approved'::public.order_status
  END;

  UPDATE public.order_returns
     SET status      = 'approved',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_note,
         updated_at  = now()
   WHERE id = p_return_id;

  PERFORM public.update_order_status(v_return.order_id, v_target_status, p_admin_id, p_note);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    v_target_status::text,
    p_admin_id,
    'admin',
    COALESCE(p_note, v_return.request_type || ' request approved'),
    jsonb_build_object('return_id', p_return_id, 'request_type', v_return.request_type)
  );
END;
$$;


-- ── reject_return (fixed) ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reject_return(
  p_return_id uuid,
  p_admin_id  uuid,
  p_reason    text
)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_return        RECORD;
  v_target_status public.order_status;
BEGIN
  SELECT id, order_id, status, request_type INTO v_return
    FROM public.order_returns
   WHERE id = p_return_id
     FOR UPDATE;

  IF v_return.id IS NULL THEN
    RAISE EXCEPTION 'Return request % not found', p_return_id USING ERRCODE = 'P0005';
  END IF;

  IF v_return.status != 'requested' THEN
    RAISE EXCEPTION 'Request is not in requested state (current: %)', v_return.status
      USING ERRCODE = 'P0006';
  END IF;

  -- Branch: replacement → replacement_rejected, return → return_rejected
  v_target_status := CASE COALESCE(v_return.request_type, 'return')
    WHEN 'replacement' THEN 'replacement_rejected'::public.order_status
    ELSE                    'return_rejected'::public.order_status
  END;

  UPDATE public.order_returns
     SET status      = 'rejected',
         reviewed_by = p_admin_id,
         reviewed_at = now(),
         review_note = p_reason,
         updated_at  = now()
   WHERE id = p_return_id;

  PERFORM public.update_order_status(v_return.order_id, v_target_status, p_admin_id, p_reason);

  INSERT INTO public.order_events (order_id, event_type, actor_id, actor_type, description, metadata)
  VALUES (
    v_return.order_id,
    v_target_status::text,
    p_admin_id,
    'admin',
    v_return.request_type || ' request rejected: ' || p_reason,
    jsonb_build_object('return_id', p_return_id, 'request_type', v_return.request_type)
  );
END;
$$;
