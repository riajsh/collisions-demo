import { cn } from "@/lib/utils";

type ListMetaProps = {
  children: React.ReactNode;
  className?: string;
};

export function ListMeta({ children, className }: ListMetaProps) {
  return (
    <p className={cn("text-caption text-muted-foreground", className)}>
      {children}
    </p>
  );
}

export function formatCountLabel(
  count: number,
  singular: string,
  plural = `${singular}s`,
): string {
  return `${count.toLocaleString()} ${count === 1 ? singular : plural}`;
}
