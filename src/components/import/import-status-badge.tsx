import type { ImportStatus } from "@/lib/import/types";

import { Badge } from "@/components/ui/badge";

const STATUS_LABELS: Record<ImportStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  complete: "Complete",
  failed: "Failed",
};

const STATUS_VARIANT: Record<
  ImportStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  pending: "outline",
  processing: "secondary",
  complete: "default",
  failed: "destructive",
};

type ImportStatusBadgeProps = {
  status: ImportStatus;
};

export function ImportStatusBadge({ status }: ImportStatusBadgeProps) {
  return <Badge variant={STATUS_VARIANT[status]}>{STATUS_LABELS[status]}</Badge>;
}
