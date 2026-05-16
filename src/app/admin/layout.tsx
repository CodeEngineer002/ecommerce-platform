import { redirect } from "next/navigation";

import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { NavigationEvents } from "@/components/ui/navigation-events";
import { NavigationOverlay } from "@/components/ui/navigation-overlay";
import { AdminProvider } from "@/lib/admin/context";
import { APP_NAME, ROUTES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/server";

async function getUserPermissions(
  userId: string,
  role: string,
): Promise<string[]> {
  if (role === "admin" || role === "super_admin") return ["*"];
  const supabase = await createClient();
  // Fetch permissions via user_roles → roles → role_permissions → permissions
  const { data } = await supabase
    .from("user_roles")
    .select("roles!inner(role_permissions!inner(permissions!inner(code)))")
    .eq("user_id", userId);

  const codes: string[] = [];
  if (data) {
    for (const ur of data as unknown as {
      roles: { role_permissions: { permissions: { code: string } }[] };
    }[]) {
      for (const rp of ur.roles.role_permissions) {
        codes.push(rp.permissions.code);
      }
    }
  }
  return codes;
}

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect(ROUTES.login);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .single();

  if (!profile || !["admin", "super_admin"].includes(profile.role ?? "")) {
    redirect("/");
  }

  const permissions = await getUserPermissions(user.id, profile.role ?? "");

  return (
    <AdminProvider
      user={{ id: user.id, email: user.email ?? "" }}
      profile={{ id: profile.id, role: profile.role as "admin" | "super_admin" | "customer" }}
      permissions={permissions}
    >
      <div className="flex min-h-screen">
        <AdminSidebar title={`${APP_NAME} Admin`} />

        <div className="flex flex-1 flex-col">
          <header className="flex h-header items-center border-b bg-card px-6">
            <p className="text-sm text-muted-foreground">
              Signed in as{" "}
              <span className="font-medium text-foreground">{user.email}</span>
            </p>
          </header>
          <main className="flex-1 p-6">{children}</main>
        </div>
      </div>
      <NavigationOverlay />
      <NavigationEvents />
    </AdminProvider>
  );
}
