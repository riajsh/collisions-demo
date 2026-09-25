import Link from "next/link";

import { cn } from "@/lib/utils";

type FilterChipRowProps = {
  label: string;
  children: React.ReactNode;
  className?: string;
};

export function FilterChipRow({ label, children, className }: FilterChipRowProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <span className="text-caption text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

type FilterChipLinkProps = {
  href: string;
  isActive: boolean;
  children: React.ReactNode;
};

export function FilterChipLink({ href, isActive, children }: FilterChipLinkProps) {
  return (
    <Link
      href={href}
      aria-current={isActive ? "true" : undefined}
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-caption transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        isActive
          ? "border-foreground bg-foreground font-medium text-background"
          : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground",
      )}
    >
      {children}
    </Link>
  );
}
