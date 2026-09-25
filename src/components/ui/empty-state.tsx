import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  variant?: "dashed" | "solid";
  className?: string;
  children?: React.ReactNode;
};

export function EmptyState({
  title,
  description,
  variant = "solid",
  className,
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "px-6 py-10 text-center",
        variant === "dashed"
          ? "rounded-lg border border-dashed border-border bg-muted/30"
          : "rounded-lg border border-border bg-card",
        className,
      )}
    >
      <p className="text-subheading font-medium text-foreground">{title}</p>
      {description ? (
        <p className="mt-2 text-body text-muted-foreground">{description}</p>
      ) : null}
      {children ? <div className="mt-6">{children}</div> : null}
    </div>
  );
}
