export default function AppLoading() {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="border-b border-border px-8 py-6">
        <div className="h-8 w-48 animate-pulse rounded-md bg-muted/60" />
        <div className="mt-2 h-4 w-96 max-w-full animate-pulse rounded-md bg-muted/40" />
      </div>
      <div className="space-y-6 px-8 py-6">
        <div className="h-10 w-full max-w-2xl animate-pulse rounded-md bg-muted/50" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-48 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-48 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-48 animate-pulse rounded-lg bg-muted/30" />
          <div className="h-48 animate-pulse rounded-lg bg-muted/30" />
        </div>
      </div>
    </div>
  );
}
