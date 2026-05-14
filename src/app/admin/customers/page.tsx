import { DataTable, type ColumnDef } from "@/components/common/data-table";
import { PageHeader } from "@/components/common/page-header";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils";
import type { Profile } from "@/types";

const columns: ColumnDef<Profile>[] = [
  {
    header: "Name",
    cell: (c) => <span className="font-medium">{c.full_name ?? "—"}</span>,
  },
  {
    header: "Email",
    cell: (c) => <span className="text-muted-foreground">{c.email}</span>,
  },
  {
    header: "Role",
    align: "center",
    cell: (c) => (
      <Badge variant={c.role === "admin" ? "brand" : "secondary"} className="capitalize">
        {c.role}
      </Badge>
    ),
  },
  {
    header: "Status",
    align: "center",
    cell: (c) => (
      <Badge variant={c.is_active ? "success" : "destructive"}>
        {c.is_active ? "Active" : "Inactive"}
      </Badge>
    ),
  },
  {
    header: "Joined",
    align: "right",
    cell: (c) => <span className="text-muted-foreground">{formatDate(c.created_at)}</span>,
  },
];

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

      <DataTable
        columns={columns}
        data={customers ?? []}
        keyFn={(c) => c.id}
        emptyTitle="No customers yet"
        emptyDescription="Registered users will appear here."
      />
    </div>
  );
}
