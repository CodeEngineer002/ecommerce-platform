import { redirect } from "next/navigation";

import { ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";
import { ProfileSidebarNav } from "@/app/(storefront)/profile/profile-sidebar-nav";

export default async function LocaleProfileLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(ROUTES.login);

  return (
    <div className="container py-10">
      <div className="flex flex-col gap-8 md:flex-row md:gap-12">
        <aside className="w-full shrink-0 md:w-56">
          <h2 className="mb-4 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Account
          </h2>
          <ProfileSidebarNav />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
