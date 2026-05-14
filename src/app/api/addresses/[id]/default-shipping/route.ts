/**
 * PATCH /api/addresses/[id]/default-shipping
 * Sets the given address as the user's default shipping address.
 * DB trigger ensures any previously-default address is unset atomically.
 */

import { setDefaultShipping } from "@/domain/address/address-service";
import { apiSuccess, withApiHandler } from "@/lib/api";
import { AuthError } from "@/lib/errors";
import { withRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const PATCH = withRateLimit(
  withApiHandler(async (request: Request, ctx: RouteContext) => {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new AuthError();

    const { id } = await ctx.params;
    const address = await setDefaultShipping(user.id, id);
    return apiSuccess(address);
  }),
  { limit: 20, windowMs: 60_000, routeKey: "addresses:default-shipping" },
);
