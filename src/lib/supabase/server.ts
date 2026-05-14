import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

import { env } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "@/types/database.types";

/**
 * User-scoped server client.
 * Reads/writes the session cookie so Row Level Security applies correctly.
 * Use in Server Components, Server Actions, and Route Handlers that need
 * to act on behalf of the logged-in user.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        } catch {
          // Server Component: cookie mutation is intentionally ignored
        }
      },
    },
  });
}

/**
 * Service-role client (bypasses RLS).
 *
 * Architectural note: the service role key must NEVER be exposed to the
 * browser. This client is synchronous — no cookie store needed because
 * the service role authenticates via the key itself, not a user session.
 *
 * Use only in:
 *   - Trusted API Route Handlers (server-side)
 *   - Background jobs / webhooks
 *   - Admin operations that explicitly need to bypass RLS
 *
 * Do NOT use for regular user-facing queries — RLS exists for a reason.
 */
export function createServiceClient() {
  return createSupabaseClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  );
}
