"use client";

import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import type { OrgUser } from "@/lib/data/users";
import { TEAM_MEMBER_TITLES } from "@/config/team-members";
import { useAsyncAction } from "@/lib/use-async-action";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

type TeamMembersListProps = {
  users: OrgUser[];
};

export function TeamMembersList({ users }: TeamMembersListProps) {
  const router = useRouter();
  const { isPending, run } = useAsyncAction();

  if (users.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="No team members yet"
        description="Adding a teammate needs a quick setup step behind the scenes — just ask Claude to add them and it's done in a couple of minutes."
      >
        <Button
          type="button"
          variant="outline"
          disabled={isPending}
          onClick={() => void run(async () => router.refresh())}
        >
          Refresh
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-dashed border-border bg-muted/30 p-5">
        <h2 className="text-subheading font-medium text-foreground">
          Adding team members
        </h2>
        <p className="mt-2 text-body text-muted-foreground">
          There&rsquo;s no add-teammate button yet — just ask Claude to add
          someone and it&rsquo;ll be done behind the scenes in a couple of
          minutes. A
          proper in-app way to add and edit teammates is coming later.
        </p>
      </section>

      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {users.map((user) => {
          const title =
            TEAM_MEMBER_TITLES[user.email.toLowerCase()] ??
            (user.role === "admin" ? "Admin" : "Member");

          return (
            <li key={user.id} className="flex items-center gap-4 px-4 py-4">
              <div
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-body font-medium text-foreground"
              >
                {initials(user.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-body font-medium text-foreground">
                  {user.fullName}
                </p>
                <p className="text-caption text-muted-foreground">
                  {title} · {user.email}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
