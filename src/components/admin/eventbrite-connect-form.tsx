"use client";

import { useRef, useState } from "react";

import { connectEventbriteAccountAction } from "@/app/(app)/admin/integrations/actions";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/lib/use-async-action";

export function EventbriteConnectForm() {
  const { isPending, run } = useAsyncAction();
  const [error, setError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);

        void run(async () => {
          setError(null);
          const result = await connectEventbriteAccountAction(formData);
          if (result.error) {
            setError(result.error);
            return;
          }
          formRef.current?.reset();
        });
      }}
    >
      <label
        htmlFor="eventbrite-token"
        className="block text-body font-medium text-foreground"
      >
        Eventbrite private token
      </label>
      <p className="max-w-2xl text-caption text-muted-foreground">
        From your Eventbrite account: Account Settings → Developer Links →
        API Keys. Paste it here — it&apos;s stored encrypted and never shown
        again.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          id="eventbrite-token"
          name="token"
          type="password"
          autoComplete="off"
          placeholder="Paste your private token"
          className="w-full max-w-md rounded-md border border-border bg-background px-3 py-2 text-body text-foreground"
        />
        <Button type="submit" disabled={isPending}>
          {isPending ? "Connecting…" : "Connect Eventbrite"}
        </Button>
      </div>
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
