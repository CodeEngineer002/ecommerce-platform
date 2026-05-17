"use client";

import { useState } from "react";
import type { UseFormRegister, FieldErrors } from "react-hook-form";

import { FormField } from "@/components/common/form-field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductFormData } from "@/lib/validators";

interface Props {
  register: UseFormRegister<ProductFormData>;
  errors: FieldErrors<ProductFormData>;
  defaultTitle?: string;
  defaultDesc?: string;
}

function CharCounter({ value, max }: { value: string; max: number }) {
  const len = value.length;
  const over = len > max;
  return (
    <span className={over ? "text-destructive" : len > max * 0.9 ? "text-amber-600" : "text-muted-foreground"}>
      {len}/{max}
    </span>
  );
}

export function SeoSection({ register, errors, defaultTitle = "", defaultDesc = "" }: Props) {
  const [title, setTitle] = useState(defaultTitle);
  const [desc, setDesc] = useState(defaultDesc);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>SEO</CardTitle>
          <CardDescription>
            Optimize how this product appears in search engines and social sharing.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">SEO Title</label>
              <CharCounter value={title} max={60} />
            </div>
            <FormField
              label=""
              placeholder="Max 60 characters — defaults to product name if empty"
              error={errors.seo_title}
              {...register("seo_title", { onChange: (e) => setTitle(e.target.value) })}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Meta Description</label>
              <CharCounter value={desc} max={160} />
            </div>
            <FormField
              label=""
              as="textarea"
              rows={3}
              placeholder="Max 160 characters — shown in search results"
              error={errors.seo_desc}
              {...register("seo_desc", { onChange: (e) => setDesc(e.target.value) })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Search preview */}
      {(title || desc) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Search Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-md border bg-muted/30 p-4 text-sm">
              <p className="text-blue-600 text-base font-medium">{title || "(Product name)"}</p>
              <p className="text-green-700 text-xs mt-0.5">yourdomain.com › products › slug</p>
              <p className="text-muted-foreground mt-1 text-xs">{desc || "(Meta description)"}</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
