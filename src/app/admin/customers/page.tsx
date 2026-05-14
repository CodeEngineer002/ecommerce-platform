import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils";
import { createClient } from "@/lib/supabase/server";

export default async function AdminCustomersPage() {
  const supabase = await createClient();
  const { data: customers } = await supabase
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customers"
        description={`${customers?.length ?? 0} registered users`}
      />

      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              <th className="px-4 py-3 text-left font-medium">Name</th>
              <th className="px-4 py-3 text-left font-medium">Email</th>
              <th className="px-4 py-3 text-center font-medium">Role</th>
              <th className="px-4 py-3 text-center font-medium">Status</th>
              <th className="px-4 py-3 text-right font-medium">Joined</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(customers ?? []).map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-4 py-3 font-medium">{c.full_name ?? "—"}</td>
                <td className="px-4 py-3 text-muted-foreground">{c.email}</td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={c.role === "admin" ? "brand" : "secondary"} className="capitalize">
                    {c.role}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-center">
                  <Badge variant={c.is_active ? "success" : "destructive"}>
                    {c.is_active ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  {formatDate(c.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
