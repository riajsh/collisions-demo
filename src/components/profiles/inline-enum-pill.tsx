"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatEnumLabel } from "@/lib/format/enum";
import { toastError } from "@/lib/toast";
import { useAsyncAction } from "@/lib/use-async-action";
import { cn } from "@/lib/utils";

type InlineEnumPillProps<T extends string> = {
  value: T;
  options: readonly T[];
  onSave: (next: T) => Promise<{ error?: string }>;
  variant?: "solid" | "outline";
};

/**
 * A status-line pill that becomes an open dropdown on click — used for
 * Status and Type in the profile header, which used to live in a separate
 * "Relationship" edit form lower on the page. Same click-to-edit,
 * opens-immediately pattern as the Profiles table's inline status cell.
 *
 * Formats labels with formatEnumLabel internally rather than taking a
 * formatLabel prop — this component is rendered from a Server Component
 * (ProfileHeader), and only Server Actions (not plain functions, however
 * simple) can cross the server-to-client prop boundary. Importing the
 * formatter directly here avoids passing any non-action function as a prop.
 */
export function InlineEnumPill<T extends string>({
  value,
  options,
  onSave,
  variant = "solid",
}: InlineEnumPillProps<T>) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();
  const [isEditing, setIsEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className={cn(
          "rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors",
          variant === "solid"
            ? "bg-accent text-accent-foreground hover:bg-accent/80"
            : "bg-muted text-muted-foreground hover:bg-muted/70",
        )}
      >
        {formatEnumLabel(localValue)}
      </button>
    );
  }

  return (
    <Select
      open
      value={localValue}
      disabled={isPending}
      onOpenChange={(open) => {
        if (!open) {
          setIsEditing(false);
        }
      }}
      onValueChange={(next) => {
        const nextValue = next as T;
        const previous = localValue;
        setLocalValue(nextValue);
        setIsEditing(false);
        void run(async () => {
          const result = await onSave(nextValue);
          if (result.error) {
            setLocalValue(previous);
            toastError("Could not save", result.error);
            return;
          }
          router.refresh();
        });
      }}
    >
      <SelectTrigger size="sm" className="h-6 w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {formatEnumLabel(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
