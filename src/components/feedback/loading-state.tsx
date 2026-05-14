import { cn } from "@/lib/utils";

interface LoadingStateProps {
  className?: string;
  text?: string;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: "h-4 w-4 border-2",
  md: "h-8 w-8 border-2",
  lg: "h-12 w-12 border-4",
};

export function LoadingState({ className, text = "Loading…", size = "md" }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-label={text}
      className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}
    >
      {/* Spinner is decorative — aria-label on the wrapper conveys state */}
      <div
        className={cn(
          "animate-spin rounded-full border-primary border-t-transparent",
          sizeMap[size]
        )}
        aria-hidden="true"
      />
      {text && (
        <p className="text-sm text-muted-foreground" aria-hidden="true">
          {text}
        </p>
      )}
    </div>
  );
}

export function InlineLoader({ className }: { className?: string }) {
  return (
    <span role="status" aria-label="Loading" className="inline-flex">
      <span
        className={cn(
          "h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent",
          className
        )}
        aria-hidden="true"
      />
    </span>
  );
}
