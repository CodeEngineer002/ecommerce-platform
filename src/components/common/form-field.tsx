import * as React from "react";
import type { FieldError } from "react-hook-form";

import { Input, type InputProps } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea, type TextareaProps } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface BaseFieldProps {
  label?: string;
  description?: string;
  error?: FieldError | string;
  required?: boolean;
  className?: string;
}

// Omit `error` from underlying props to avoid type collision with
// our `error: FieldError | string` in BaseFieldProps.
type FormInputFieldProps = BaseFieldProps & Omit<InputProps, "error"> & { as?: "input" };
type FormTextareaFieldProps = BaseFieldProps & Omit<TextareaProps, "error"> & { as: "textarea" };

type FormFieldProps = FormInputFieldProps | FormTextareaFieldProps;

/**
 * FormField wraps a label, input/textarea, description, and error message.
 *
 * Accessibility:
 * - Label linked to input via htmlFor/id
 * - Description + error linked via aria-describedby
 * - aria-invalid set when error is present
 * - Error message uses role="alert" for immediate SR announcement
 * - Required asterisk is hidden from screen readers (aria-required conveys it)
 */
export const FormField = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, FormFieldProps>(
  ({ label, description, error, required, className, as, ...props }, ref) => {
    const errorMessage = typeof error === "string" ? error : error?.message;
    const id = props.id ?? props.name;
    const descId = id && description ? `${id}-desc` : undefined;
    const errorId = id && errorMessage ? `${id}-error` : undefined;
    const ariaDescribedBy = [descId, errorId].filter(Boolean).join(" ") || undefined;

    const sharedA11y = {
      id,
      "aria-invalid": errorMessage ? (true as const) : undefined,
      "aria-describedby": ariaDescribedBy,
      "aria-required": required,
    };

    return (
      <div className={cn("space-y-1.5", className)}>
        {label && (
          <Label htmlFor={id}>
            {label}
            {required && (
              <span className="ml-1 text-destructive" aria-hidden="true">
                *
              </span>
            )}
          </Label>
        )}

        {as === "textarea" ? (
          <Textarea
            {...sharedA11y}
            error={!!errorMessage}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            {...(props as TextareaProps)}
          />
        ) : (
          <Input
            {...sharedA11y}
            error={!!errorMessage}
            ref={ref as React.Ref<HTMLInputElement>}
            {...(props as InputProps)}
          />
        )}

        {description && !errorMessage && (
          <p id={descId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
        {errorMessage && (
          <p id={errorId} role="alert" className="text-xs text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }
);
FormField.displayName = "FormField";
