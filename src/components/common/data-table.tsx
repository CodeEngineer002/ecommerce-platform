import * as React from "react";

import { Pagination } from "@/components/common/pagination";
import { EmptyState } from "@/components/feedback/empty-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { cn } from "@/lib/utils";

export interface ColumnDef<T> {
  header: string;
  align?: "left" | "center" | "right";
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  columns: ColumnDef<T>[];
  data: T[];
  keyFn: (row: T) => string;
  isLoading?: boolean;
  loadingText?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  page?: number;
  totalPages?: number;
  onPageChange?: (page: number) => void;
  onRowClick?: (row: T) => void;
  className?: string;
}

const alignClass = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} as const;

export function DataTable<T>({
  columns,
  data,
  keyFn,
  isLoading,
  loadingText = "Loading…",
  emptyTitle = "No results",
  emptyDescription,
  page,
  totalPages,
  onPageChange,
  onRowClick,
  className,
}: DataTableProps<T>) {
  if (isLoading) return <LoadingState text={loadingText} />;

  return (
    <div className={cn("space-y-4", className)}>
      <div className="rounded-lg border">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.header}
                  className={cn(
                    "px-4 py-3 font-medium",
                    alignClass[col.align ?? "left"],
                    col.headerClassName,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-0">
                  <EmptyState title={emptyTitle} description={emptyDescription} />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={keyFn(row)}
                  className={cn(
                    "hover:bg-muted/30",
                    onRowClick && "cursor-pointer",
                  )}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  {columns.map((col) => (
                    <td
                      key={col.header}
                      className={cn(
                        "px-4 py-3",
                        alignClass[col.align ?? "left"],
                        col.cellClassName,
                      )}
                      onClick={
                        // Prevent row click when clicking the actions column (last col with no header)
                        col.header === "" ? (e) => e.stopPropagation() : undefined
                      }
                    >
                      {col.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {onPageChange && totalPages && totalPages > 1 && page && (
        <div className="flex justify-center">
          <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
        </div>
      )}
    </div>
  );
}
