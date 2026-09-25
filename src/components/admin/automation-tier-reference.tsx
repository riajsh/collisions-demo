type AutomationTierReferenceProps = {
  variant?: "compact" | "full";
};

const TIERS = [
  {
    id: "A",
    label: "Happens automatically",
    examples:
      "Past meetings on matched profiles, named attendees auto-added, exact email links",
  },
  {
    id: "B",
    label: "Auto-suggested — you can edit",
    examples: "Auto-written summaries, company hints — never overwrites your edits",
  },
  {
    id: "C",
    label: "Needs your review",
    examples:
      "New people, fuzzy links, connections, owners, tags — shows up in your review list",
  },
  {
    id: "D",
    label: "Manual only",
    examples: "Scores, ownership from sync, silent profile overwrites",
  },
] as const;

export function AutomationTierReference({
  variant = "full",
}: AutomationTierReferenceProps) {
  if (variant === "compact") {
    return (
      <p className="text-caption text-muted-foreground">
        Sync never waits on you for matched meetings. Your review list is there
        when you want it — nothing is blocked on it. Policy:{" "}
        <code className="text-caption">docs/decisions/0010-automation-boundaries.md</code>
      </p>
    );
  }

  return (
    <details className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-3">
      <summary className="cursor-pointer text-body font-medium text-foreground">
        What happens automatically vs what needs you
      </summary>
      <div className="mt-4 space-y-4">
        <p className="text-body text-muted-foreground">
          Everything gets captured at full speed. Your review list is there
          when you want it — nothing waits on it. Timelines and Overview
          update before you open this page.
        </p>
        <ul className="space-y-3">
          {TIERS.map((tier) => (
            <li key={tier.id} className="text-body">
              <span className="font-medium text-foreground">{tier.label}</span>
              <span className="text-muted-foreground"> · {tier.examples}</span>
            </li>
          ))}
        </ul>
        <p className="text-caption text-muted-foreground">
          Full policy:{" "}
          <code className="text-caption">docs/decisions/0010-automation-boundaries.md</code>
        </p>
      </div>
    </details>
  );
}
