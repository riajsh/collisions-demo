import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/(auth)/login/actions";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { OwnerDot } from "@/components/profiles/owner-dot";
import { getCurrentUserContext } from "@/lib/data/users";
import { formatEnumLabel } from "@/lib/format/enum";

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default async function MePage() {
  const me = await getCurrentUserContext();

  if (me.profileId) {
    redirect(`/profiles/${me.profileId}`);
  }

  return (
    <>
      <PageHeader
        title="My account"
        description="Your identity on the team."
      />
      <div className="space-y-6 px-8 py-6">
        <section className="flex flex-wrap items-start gap-4 rounded-lg border border-border bg-card p-6">
          <div
            aria-hidden
            className="flex size-14 items-center justify-center rounded-full bg-muted text-subheading font-medium text-foreground"
          >
            {initials(me.fullName)}
          </div>
          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-subheading font-medium text-foreground">
                {me.fullName}
              </h2>
              <OwnerDot userId={me.id} />
            </div>
            <p className="text-body text-muted-foreground">
              {me.jobTitle ?? formatEnumLabel(me.role)}
              {me.jobTitle ? ` · ${formatEnumLabel(me.role)}` : ""}
            </p>
            <p className="text-body text-muted-foreground">{me.email}</p>
          </div>
          <form action={signOut}>
            <Button type="submit" variant="outline">
              Sign out
            </Button>
          </form>
        </section>

        <section className="space-y-3 rounded-lg border border-border bg-card p-6">
          <h2 className="text-heading font-medium text-foreground">
            Relationship ownership
          </h2>
          <p className="max-w-2xl text-body text-muted-foreground">
            No ecosystem profile is linked to your email yet. That is normal for
            most team members — you appear here as an owner, not as an external
            contact.
          </p>
          {me.ownedProfileCount > 0 ? (
            <Button asChild>
              <Link href={`/profiles?owner=${me.id}`}>
                View {me.ownedProfileCount} profile
                {me.ownedProfileCount === 1 ? "" : "s"} you own
              </Link>
            </Button>
          ) : (
            <p className="text-body text-muted-foreground">
              You are not assigned as an owner on any profiles yet.
            </p>
          )}
        </section>

        {me.role === "admin" ? (
          <section className="space-y-2">
            <Button asChild variant="outline">
              <Link href="/admin">Open admin</Link>
            </Button>
          </section>
        ) : null}
      </div>
    </>
  );
}
