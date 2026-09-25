import { cva } from "class-variance-authority";

import { cn } from "@/lib/utils";
import type { Database } from "@/types/database";

type OwnerStrength = Database["public"]["Enums"]["owner_strength"];

export const strengthBadge = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-label font-medium",
  {
    variants: {
      strength: {
        inner_circle:
          "bg-[var(--color-interactive-subtle)] text-[var(--color-strength-inner-circle)]",
        strong:
          "bg-[var(--color-interactive-subtle)] text-[var(--color-strength-strong)]",
        warm: "bg-[var(--color-surface-secondary)] text-[var(--color-strength-warm)]",
        weak: "bg-[var(--color-surface-secondary)] text-[var(--color-strength-weak)]",
        unknown:
          "bg-[var(--color-surface-secondary)] text-[var(--color-strength-unknown)]",
      },
    },
    defaultVariants: {
      strength: "unknown",
    },
  },
);

const STRENGTH_LABELS: Record<OwnerStrength, string> = {
  inner_circle: "Inner circle",
  strong: "Strong",
  warm: "Warm",
  weak: "Weak",
  unknown: "Unknown",
};

type StrengthBadgeProps = {
  strength: OwnerStrength | null;
  className?: string;
};

export function StrengthBadge({ strength, className }: StrengthBadgeProps) {
  const value = strength ?? "unknown";

  return (
    <span className={cn(strengthBadge({ strength: value }), className)}>
      {STRENGTH_LABELS[value]}
    </span>
  );
}
