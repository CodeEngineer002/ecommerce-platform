"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api";

interface Props {
  returnId:    string;
  requestType: string;
}

export function AdminReturnActions({ returnId, requestType }: Props) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [isPending, startTransition] = useTransition();

  const label = requestType === "replacement" ? "replacement" : "return";

  async function handleAction(action: "approve" | "reject") {
    if (action === "reject" && !note.trim()) {
      toast.error("A rejection reason is required.");
      return;
    }

    startTransition(async () => {
      try {
        await apiFetch(`/api/admin/returns/${returnId}`, {
          method: "PATCH",
          body: JSON.stringify({ action, note: note.trim() || undefined }),
        });
        toast.success(
          action === "approve"
            ? `${label.charAt(0).toUpperCase() + label.slice(1)} request approved`
            : `${label.charAt(0).toUpperCase() + label.slice(1)} request rejected`,
        );
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Action failed");
      }
    });
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <label className="block text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
          Note (required for rejection)
        </label>
        <textarea
          className="w-full rounded-md border bg-background px-3 py-2 text-sm"
          rows={2}
          maxLength={500}
          placeholder={`Add a note to the customer about this ${label}…`}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5 text-red-600 border-red-200 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
          onClick={() => handleAction("reject")}
          disabled={isPending}
        >
          <XCircle className="h-4 w-4" />
          Reject
        </Button>
        <Button
          size="sm"
          className="gap-1.5"
          onClick={() => handleAction("approve")}
          disabled={isPending}
        >
          <CheckCircle2 className="h-4 w-4" />
          Approve
        </Button>
      </div>
    </div>
  );
}
