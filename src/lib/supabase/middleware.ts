import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

import { env } from "@/lib/env";
import type { Database } from "@/types/database.types";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;

  // Match both bare paths (/checkout) AND localized paths (/us/en/checkout).
  // Bare match: path starts directly with the segment.
  // Localized match: path matches /<country>/<lang>/<segment>.
  const protectedSegments = ["profile", "orders", "checkout"];
  const adminPaths = ["/admin"];
  const authPaths = ["/login", "/register", "/forgot-password"];

  const isProtected =
    protectedSegments.some((seg) => path.startsWith(`/${seg}`)) ||
    protectedSegments.some((seg) =>
      /^\/[a-z]{2}\/[a-z]{2}\//.test(path) &&
      path.split("/")[3] === seg
    );
  const isAdmin = adminPaths.some((p) => path.startsWith(p));
  const isAuthPage = authPaths.some((p) => path.startsWith(p));

  if ((isProtected || isAdmin) && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", path);
    return NextResponse.redirect(url);
  }

  if (isAdmin && user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !["admin", "super_admin"].includes(profile.role)) {
      return NextResponse.redirect(new URL("/", request.url));
    }
  }

  if (isAuthPage && user) {
    return NextResponse.redirect(new URL("/", request.url));
  }

  return supabaseResponse;
}
