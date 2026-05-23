-- Phase 3.4 audit: list all SECURITY DEFINER functions in public schema,
-- their argument signatures, and the roles that hold EXECUTE on them.
SELECT
  n.nspname || '.' || p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS args,
  CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END AS security,
  COALESCE(
    (SELECT string_agg(DISTINCT grantee, ', ')
       FROM information_schema.role_routine_grants
      WHERE specific_schema = n.nspname
        AND routine_name    = p.proname
        AND privilege_type  = 'EXECUTE'
        AND grantee IN ('anon','authenticated','service_role','PUBLIC')),
    '(default — PUBLIC EXECUTE)'
  ) AS execute_grantees
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.prosecdef = true
ORDER BY p.proname;
