"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, PencilIcon } from "lucide-react";

import { acceptSuggestedCompanyAction } from "@/app/(app)/profiles/[id]/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAppDialog } from "@/components/ui/app-dialog-provider";
import { Input } from "@/components/ui/input";
import { companySuggestionLabel } from "@/lib/enrichment/labels";
import type { CompanySuggestion } from "@/lib/enrichment/company-from-email";
import { toastSuccess } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";
import { cn } from "@/lib/utils";

type SuggestedCompanyFieldProps = {
  profileId: string;
  suggestion: CompanySuggestion;
  variant?: "detail" | "table";
  className?: string;
};

export function SuggestedCompanyField({
  profileId,
  suggestion,
  variant = "detail",
  className,
}: SuggestedCompanyFieldProps) {
  const router = useRouter();
  const { alert } = useAppDialog();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [value, setValue] = useState(suggestion.name);

  function handleConfirm(overrideValue?: string) {
    const trimmed = (overrideValue ?? value).trim();
    if (!trimmed) {
      return;
    }

    void run(async () => {
      const result = await acceptSuggestedCompanyAction(profileId, trimmed);
      if (result.error) {
        await alert({ title: "Could not apply company", description: result.error });
        return;
      }
      toastSuccess("Company applied");
      setIsEditing(false);
      router.refresh();
    });
  }

  if (isEditing) {
    return (
      <div
        className={cn("space-y-2", className)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        {variant === "detail" ? (
          <p className="text-caption text-muted-foreground">Company</p>
        ) : null}
        <Input
          value={value}
          onChange={(event) => setValue(event.target.value)}
          aria-label="Edit suggested company"
          autoFocus
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              handleConfirm();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setValue(suggestion.name);
              setIsEditing(false);
            }
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={isPending || !value.trim()}
            onClick={() => handleConfirm()}
          >
            <CheckIcon className="size-3.5" aria-hidden="true" />
            {isPending ? "Saving…" : "Confirm"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={isPending}
            onClick={() => {
              setValue(suggestion.name);
              setIsEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  if (variant === "table") {
    return (
      <div
        className={cn("inline-flex max-w-full items-center gap-1", className)}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="inline-flex min-w-0 flex-1 items-center gap-1 rounded-md border border-dashed border-border bg-muted/20 px-2 py-1 text-left transition-colors hover:border-foreground/30 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setIsEditing(true)}
        >
          <span className="truncate text-[var(--color-data-inferred)]">
            {suggestion.name}
          </span>
          <PencilIcon className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
        <Button
          type="button"
          size="icon"
          variant="outline"
          className="size-7 shrink-0"
          disabled={isPending}
          aria-label={`Confirm company ${suggestion.name}`}
          onClick={() => handleConfirm(suggestion.name)}
        >
          <CheckIcon className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full space-y-2 rounded-md border border-dashed border-border bg-muted/20 p-3",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-caption text-muted-foreground">Company</p>
        <Badge variant="secondary">Suggested</Badge>
      </div>
      <button
        type="button"
        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={() => setIsEditing(true)}
      >
        <p className="text-body font-medium text-[var(--color-data-inferred)]">
          {suggestion.name}
        </p>
        <p className="text-caption text-muted-foreground">
          {companySuggestionLabel(suggestion)} — click to edit
        </p>
      </button>
      <Button
        type="button"
        size="sm"
        disabled={isPending}
        onClick={() => handleConfirm(suggestion.name)}
      >
        <CheckIcon className="size-3.5" aria-hidden="true" />
        {isPending ? "Saving…" : "Confirm"}
      </Button>
    </div>
  );
}
