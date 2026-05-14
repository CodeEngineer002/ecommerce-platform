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

// Omit `error` from the underlying props to avoid type collision with
// our own `error: FieldError | string` in BaseFieldProps.
type FormInputFieldProps = BaseFieldProps & Omit<InputProps, "error"> & { as?: "input" };
type FormTextareaFieldProps = BaseFieldProps & Omit<TextareaProps, "error"> & { as: "textarea" };

type FormFieldProps = FormInputFieldProps | FormTextareaFieldProps;

export const FormField = React.forwardRef<HTMLInputElement | HTMLTextAreaElement, FormFieldProps>(
  ({ label, description, error, required, className, as, ...props }, ref) => {
    const errorMessage = typeof error === "string" ? error : error?.message;
    const id = props.id ?? props.name;

    return (
      <div className={cn("space-y-1.5", className)}>
        {label && (
          <Label htmlFor={id}>
            {label}
            {required && <span className="ml-1 text-destructive">*</span>}
          </Label>
        )}

        {as === "textarea" ? (
          <Textarea
            id={id}
            error={!!errorMessage}
            ref={ref as React.Ref<HTMLTextAreaElement>}
            {...(props as TextareaProps)}
          />
        ) : (
          <Input
            id={id}
            error={!!errorMessage}
            ref={ref as React.Ref<HTMLInputElement>}
            {...(props as InputProps)}
          />
        )}

        {description && !errorMessage && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {errorMessage && <p className="text-xs text-destructive">{errorMessage}</p>}
      </div>
    );
  }
);
FormField.displayName = "FormField";
