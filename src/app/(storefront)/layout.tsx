import { CartDrawer } from "@/components/ecommerce/cart-drawer";
import { Footer } from "@/components/layout/footer";
import { Navbar } from "@/components/layout/navbar";
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
        email: user.email,
        full_name: profile?.full_name ?? undefined,
        avatar_url: profile?.avatar_url ?? undefined,
      }
    : null;

  return (
    <div className="flex min-h-screen flex-col">
      <Navbar user={navUser} />
      <main className="flex-1">{children}</main>
      <Footer />
      <CartDrawer />
    </div>
  );
}
