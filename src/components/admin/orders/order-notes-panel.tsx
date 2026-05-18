"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MessageSquare, Plus, StickyNote } from "lucide-react";
import { toast } from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { formatDate } from "@/lib/utils";

interface Note {
  id: string;
  content: string;
  is_internal: boolean;
  created_at: string;
  author_id: string;
}

interface AdminOrderNotesPanelProps {
  orderId: string;
}

export function AdminOrderNotesPanel({ orderId }: AdminOrderNotesPanelProps) {
  const router = useRouter();

  const [notes, setNotes]           = useState<Note[]>([]);
  const [loading, setLoading]       = useState(true);
  const [showForm, setShowForm]     = useState(false);
  const [content, setContent]       = useState("");
  const [isInternal, setIsInternal] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function fetchNotes() {
    try {
      const res  = await fetch(`/api/admin/orders/${orderId}/notes`);
      const body = await res.json();
      if (res.ok) setNotes(body.data ?? []);
    } catch {
      // silently ignore fetch errors for notes
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchNotes();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  // Auto-focus textarea when form opens
  useEffect(() => {
    if (showForm && textareaRef.current) textareaRef.current.focus();
  }, [showForm]);

  async function handleAdd() {
    if (!content.trim()) {
      toast.error("Note content is required");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: content.trim(), is_internal: isInternal }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.message ?? "Failed to add note");

      setNotes((prev) => [body.data, ...prev]);
      setContent("");
      setShowForm(false);
      toast.success("Note added");
      if (!isInternal) router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add note");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <StickyNote className="h-4 w-4" />
            Internal Notes
            {notes.length > 0 && (
              <span className="ml-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs font-normal text-muted-foreground">
                {notes.length}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 text-xs"
            onClick={() => setShowForm((v) => !v)}
          >
            <Plus className="h-3 w-3" /> Add Note
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Add note form */}
        {showForm && (
          <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write an internal note about this order…"
              rows={3}
              className="w-full rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
            />
            <div className="flex items-center justify-between gap-3">
              <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={isInternal}
                  onChange={(e) => setIsInternal(e.target.checked)}
                  className="rounded border"
                />
                Internal only (not visible to customer)
              </label>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => { setShowForm(false); setContent(""); }}
                  disabled={submitting}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={handleAdd}
                  disabled={submitting || !content.trim()}
                >
                  {submitting && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                  Save Note
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Notes list */}
        {loading ? (
          <div className="flex items-center gap-2 text-muted-foreground py-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">Loading notes…</span>
          </div>
        ) : notes.length === 0 ? (
          <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-muted-foreground">
            <MessageSquare className="h-4 w-4 shrink-0" />
            <span className="text-xs">No notes yet. Use notes to track decisions, customer calls, or escalations.</span>
          </div>
        ) : (
          <ul className="space-y-2">
            {notes.map((note) => (
              <li key={note.id} className="rounded-md border bg-muted/20 p-3">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                    note.is_internal
                      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
                      : "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300"
                  }`}>
                    {note.is_internal ? "Internal" : "Visible to customer"}
                  </span>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {formatDate(note.created_at)}
                  </span>
                </div>
                <p className="text-sm whitespace-pre-wrap">{note.content}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
