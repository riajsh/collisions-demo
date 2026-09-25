import { cn } from "@/lib/utils";

type ProfileDetailFieldProps = {
  label: string;
  value: string | null | undefined;
  className?: string;
  multiline?: boolean;
};

export function ProfileDetailField({
  label,
  value,
  className,
  multiline = false,
}: ProfileDetailFieldProps) {
  const display = value?.trim() ? value : "—";

  return (
    <div className={cn("space-y-1", className)}>
      <p className="text-caption text-muted-foreground">{label}</p>
      <p
        className={cn(
          "text-body text-foreground",
          multiline && display !== "—" && "whitespace-pre-wrap",
        )}
      >
        {display}
      </p>
    </div>
  );
}
