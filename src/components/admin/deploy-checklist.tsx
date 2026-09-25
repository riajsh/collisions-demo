import { Badge } from "@/components/ui/badge";
import type { DeployCheckItem, DeployCheckStatus } from "@/lib/deploy/checklist";

const STATUS_LABELS: Record<DeployCheckStatus, string> = {
  ok: "OK",
  missing: "Missing",
  warning: "Action",
  optional: "Optional",
};

const STATUS_VARIANTS: Record<
  DeployCheckStatus,
  "default" | "secondary" | "destructive" | "outline"
> = {
  ok: "default",
  missing: "destructive",
  warning: "outline",
  optional: "secondary",
};

type DeployChecklistProps = {
  items: DeployCheckItem[];
};

export function DeployChecklist({ items }: DeployChecklistProps) {
  const blockers = items.filter((item) => item.status === "missing");
  const warnings = items.filter((item) => item.status === "warning");

  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-6">
      <div className="space-y-1">
        <h2 className="text-heading font-medium text-foreground">
          Ready-to-launch checklist
        </h2>
        <p className="text-body text-muted-foreground">
          Behind-the-scenes setup checks before opening this up to more of the
          team. Values are never shown — only whether each item looks set up.
        </p>
      </div>

      {blockers.length > 0 ? (
        <p className="text-body text-destructive">
          {blockers.length} required item{blockers.length === 1 ? "" : "s"}{" "}
          missing — needs fixing before going live.
        </p>
      ) : warnings.length > 0 ? (
        <p className="text-body text-muted-foreground">
          Core settings look set. Review the items below that need a manual
          check in Supabase.
        </p>
      ) : (
        <p className="text-body text-muted-foreground">
          Everything required is set up.
        </p>
      )}

      <ul className="divide-y divide-border rounded-lg border border-border">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-start sm:justify-between"
          >
            <div className="space-y-1">
              <p className="text-body font-medium text-foreground">
                {item.label}
              </p>
              <p className="text-caption text-muted-foreground">{item.detail}</p>
            </div>
            <Badge variant={STATUS_VARIANTS[item.status]} className="w-fit">
              {STATUS_LABELS[item.status]}
            </Badge>
          </li>
        ))}
      </ul>
    </section>
  );
}
