import { CartDrawer } from "@/components/ecommerce/cart-drawer";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
import { NavigationOverlay } from "@/components/ui/navigation-overlay";
import { StorefrontErrorBoundary } from "@/components/common/storefront-error-boundary";
import { CartHydrationProvider } from "@/features/cart/cart-hydration-provider";
import { UserHydrationProvider } from "@/features/auth/user-hydration-provider";
import { createClient } from "@/lib/supabase/server";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  let profile = null;
  if (user) {
    const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
    profile = data;
  }

  const navUser = user
    ? {
        id: user.id,
        email: user.email ?? null,
        full_name: profile?.full_name ?? null,
        avatar_url: profile?.avatar_url ?? null,
      }
    : null;

  return (
    <UserHydrationProvider user={navUser}>
      <CartHydrationProvider>
        <div className="flex min-h-screen flex-col">
          <Navbar user={navUser} />
          <main className="flex-1">
            <StorefrontErrorBoundary>{children}</StorefrontErrorBoundary>
          </main>
          <Footer />
          <CartDrawer />
          <NavigationOverlay />
        </div>
      </CartHydrationProvider>
    </UserHydrationProvider>
  );
}
