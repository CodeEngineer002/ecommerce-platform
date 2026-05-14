import { AlertTriangle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface ErrorStateProps {
  title?: string;
  message?: string;
  retry?: () => void;
  className?: string;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  retry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn("flex flex-col items-center justify-center gap-3 py-16 text-center", className)}
    >
      <div className="rounded-full bg-destructive/10 p-4" aria-hidden="true">
        <AlertTriangle className="h-8 w-8 text-destructive" />
      </div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {message && <p className="mt-1 text-sm text-muted-foreground">{message}</p>}
      </div>
      {retry && (
        <Button variant="outline" onClick={retry} size="sm">
          Try Again
        </Button>
      )}
    </div>
  );
}
