"use client";

import { AlertTriangle, GitBranch, Globe, Unlink } from "lucide-react";
import { useState } from "react";
import { toast } from "react-hot-toast";

import { ConfirmDialog } from "@/components/common/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  breakInheritance,
  restoreInheritance,
  type CmsModule,
} from "@/features/cms/services/cms.inheritance";
import type { CountryCode, LanguageCode } from "@/lib/i18n/config";

interface InheritanceBadgeProps {
  /** The content row's inheritance fields */
  scopeType: "country" | "locale" | null | undefined;
  overrideStatus: "inherited" | "overridden" | "detached" | null | undefined;
  inheritsFromId: string | null | undefined;
  /** For locale-level content: the CMS module */
  module: CmsModule;
  country: CountryCode;
  lang: LanguageCode;
  /** The ID of the content item (locale override OR country source) */
  contentId: string;
  /** Called after a successful break/restore so the parent can refetch */
  onChanged?: () => void;
  className?: string;
}

export function InheritanceBadge({
  scopeType,
  overrideStatus,
  inheritsFromId,
  module,
  country,
  lang,
  contentId,
  onChanged,
  className,
}: InheritanceBadgeProps) {
  const [breakDialogOpen, setBreakDialogOpen] = useState(false);
  const [restoreDialogOpen, setRestoreDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  // Country-level source content
  if (scopeType === "country") {
    return (
      <Badge variant="outline" className={`gap-1 border-blue-200 bg-blue-50 text-blue-700 ${className ?? ""}`}>
        <Globe className="h-3 w-3" />
        Country source
      </Badge>
    );
  }

  // Legacy content (no scope_type) — no inheritance UI
  if (!scopeType) return null;

  // Locale-level: inherited from country (not yet broken)
  if (overrideStatus === "inherited" || (!overrideStatus && inheritsFromId)) {
    return (
      <>
        <div className={`flex items-center gap-2 ${className ?? ""}`}>
          <Badge variant="outline" className="gap-1 border-amber-200 bg-amber-50 text-amber-700">
            <GitBranch className="h-3 w-3" />
            Inherited from country
          </Badge>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground hover:text-destructive"
            onClick={() => setBreakDialogOpen(true)}
          >
            <Unlink className="mr-1 h-3 w-3" /> Break inheritance
          </Button>
        </div>

        <ConfirmDialog
          open={breakDialogOpen}
          onOpenChange={setBreakDialogOpen}
          title="Break Inheritance?"
          description={
            "This will create a locale-specific copy of the country content. " +
            "Future changes to country-level content will no longer affect this locale."
          }
          variant="destructive"
          confirmLabel="Break Inheritance"
          loading={loading}
          onConfirm={async () => {
            setLoading(true);
            try {
              await breakInheritance(inheritsFromId ?? contentId, module, country, lang);
              toast.success("Inheritance broken — locale override created");
              onChanged?.();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setLoading(false);
              setBreakDialogOpen(false);
            }
          }}
        />
      </>
    );
  }

  // Locale-level: active override
  if (overrideStatus === "overridden") {
    return (
      <>
        <div className={`flex items-center gap-2 ${className ?? ""}`}>
          <Badge variant="outline" className="gap-1 border-green-200 bg-green-50 text-green-700">
            <GitBranch className="h-3 w-3" />
            Locale override active
          </Badge>
          {inheritsFromId && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-muted-foreground hover:text-primary"
              onClick={() => setRestoreDialogOpen(true)}
            >
              <AlertTriangle className="mr-1 h-3 w-3" /> Restore inheritance
            </Button>
          )}
        </div>

        <ConfirmDialog
          open={restoreDialogOpen}
          onOpenChange={setRestoreDialogOpen}
          title="Restore Inheritance?"
          description={
            "This will deactivate the locale override and revert to country-level source content. " +
            "Your locale-specific changes will be archived (not deleted)."
          }
          variant="destructive"
          confirmLabel="Restore Inheritance"
          loading={loading}
          onConfirm={async () => {
            setLoading(true);
            try {
              await restoreInheritance(contentId, module);
              toast.success("Inheritance restored — using country content");
              onChanged?.();
            } catch (e) {
              toast.error((e as Error).message);
            } finally {
              setLoading(false);
              setRestoreDialogOpen(false);
            }
          }}
        />
      </>
    );
  }

  return null;
}
