import { ownerColour } from "@/config/owner-colours";
import { cn } from "@/lib/utils";

type OwnerDotProps = {
  userId: string;
  className?: string;
};

export function OwnerDot({ userId, className }: OwnerDotProps) {
  return (
    <span
      aria-hidden="true"
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: ownerColour(userId) }}
    />
  );
}
