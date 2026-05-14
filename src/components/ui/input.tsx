import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@/lib/utils";

// ── Variants ──────────────────────────────────────────────────────────────

export const inputVariants = cva(
  [
    "flex w-full rounded-md border bg-background text-sm",
    "ring-offset-background transition-colors",
    "file:border-0 file:bg-transparent file:text-sm file:font-medium",
    "placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
    "disabled:cursor-not-allowed disabled:opacity-50",
  ].join(" "),
  {
    variants: {
      inputSize: {
        sm: "h-8 px-2 py-1 text-xs",
        md: "h-10 px-3 py-2",
        lg: "h-12 px-4 py-3 text-base",
      },
      state: {
        default: "border-input",
        error: "border-destructive focus-visible:ring-destructive",
        success: "border-success focus-visible:ring-success",
      },
    },
    defaultVariants: {
      inputSize: "md",
      state: "default",
    },
  }
);

// ── Props ─────────────────────────────────────────────────────────────────

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  /**
   * Shorthand for state="error". Kept for backward compatibility with
   * FormField and existing usages. When both `error` and `state` are
   * provided, `state` takes precedence.
   */
  error?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, error, inputSize, state, ...props }, ref) => {
    const resolvedState = state ?? (error ? "error" : "default");

    return (
      <div className="relative flex items-center">
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 text-muted-foreground" aria-hidden="true">
            {leftIcon}
          </span>
        )}
        <input
          type={type}
          className={cn(
            inputVariants({ inputSize, state: resolvedState }),
            leftIcon && "pl-9",
            rightIcon && "pr-9",
            className
          )}
          ref={ref}
          {...props}
        />
        {rightIcon && (
          <span className="absolute right-3 text-muted-foreground">
            {rightIcon}
          </span>
        )}
      </div>
    );
  }
);
Input.displayName = "Input";

export { Input };
