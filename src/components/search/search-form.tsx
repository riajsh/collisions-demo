import Form from "next/form";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

type SearchFormProps = {
  defaultQuery?: string;
  action?: string;
  autoFocus?: boolean;
  preserveParams?: {
    tag?: string;
    owner?: string;
    status?: string;
  };
};

export function SearchForm({
  defaultQuery = "",
  action = "/search",
  autoFocus = false,
  preserveParams,
}: SearchFormProps) {
  return (
    // next/form instead of a plain <form> — a plain GET form does a full
    // browser page reload (the page goes blank while it waits), where
    // Form does a client-side navigation instead, which is what makes the
    // search route's loading.tsx actually show a "searching…" state
    // instead of a blank screen while results come back.
    <Form action={action} className="flex w-full gap-2">
      <Label htmlFor="ecosystem-search" className="sr-only">
        Search people, companies, activity, events, and email
      </Label>
      <Input
        id="ecosystem-search"
        type="search"
        name="q"
        defaultValue={defaultQuery}
        placeholder="Search people, companies, activity, events, email…"
        className="flex-1"
        autoComplete="off"
        autoFocus={autoFocus}
      />
      {preserveParams?.tag ? (
        <input type="hidden" name="tag" value={preserveParams.tag} />
      ) : null}
      {preserveParams?.owner ? (
        <input type="hidden" name="owner" value={preserveParams.owner} />
      ) : null}
      {preserveParams?.status ? (
        <input type="hidden" name="status" value={preserveParams.status} />
      ) : null}
      <Button type="submit">Search</Button>
    </Form>
  );
}
