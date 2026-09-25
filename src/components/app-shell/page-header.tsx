import { cn } from "@/lib/utils";

type PageHeaderProps = {
  title: string;
  description?: string;
  children?: React.ReactNode;
  sticky?: boolean;
  className?: string;
};

export function PageHeader({
  title,
  description,
  children,
  sticky = false,
  className,
}: PageHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 border-b border-border bg-background px-8 py-6 sm:flex-row sm:items-start sm:justify-between",
        sticky && "sticky top-0 z-20",
        className,
      )}
    >
      <div className="space-y-1">
        <h1 className="text-display font-medium text-foreground">{title}</h1>
        {description ? (
          <p className="max-w-2xl text-body text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children ? <div className="shrink-0">{children}</div> : null}
    </div>
  );
}
