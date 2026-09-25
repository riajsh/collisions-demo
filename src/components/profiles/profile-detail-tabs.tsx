"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { formatInteractionDate } from "@/lib/format/date";
import { formatEnumLabel } from "@/lib/format/enum";
import type { ProfileDetail } from "@/lib/data/profiles";
import type { OrgUser } from "@/lib/data/users";
import { parseProfileTab, type ProfileTab } from "@/lib/profiles/tab";

import { ActivityTimeline } from "./activity-timeline";
import { LogActivityForm } from "./log-activity-form";
import { ProfileConnectionsSection } from "./profile-connections-section";

type ProfileDetailTabsProps = {
  profile: ProfileDetail;
  teamUsers: OrgUser[];
  currentUserId: string;
  defaultTab?: ProfileTab;
};

export function ProfileDetailTabs({
  profile,
  teamUsers,
  currentUserId,
  defaultTab = "activity",
}: ProfileDetailTabsProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const tabFromUrl = parseProfileTab(searchParams.get("tab") ?? undefined);
  const [activeTab, setActiveTab] = useState<ProfileTab>(
    () => tabFromUrl ?? defaultTab,
  );

  function onTabChange(value: string) {
    const nextTab = value as ProfileTab;
    setActiveTab(nextTab);

    const params = new URLSearchParams(searchParams.toString());

    if (nextTab === "activity") {
      params.delete("tab");
    } else {
      params.set("tab", nextTab);
    }

    const query = params.toString();
    const url = query ? `${pathname}?${query}` : pathname;
    // Use router.replace so the Next.js router owns the history entry and
    // the browser Back button works correctly (#25).
    router.replace(url, { scroll: false });
  }

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="gap-6">
      <TabsList variant="line">
        <TabsTrigger value="activity">Activity</TabsTrigger>
        <TabsTrigger value="connections">Connections</TabsTrigger>
        <TabsTrigger value="events">Events</TabsTrigger>
        <TabsTrigger value="notes">Relationship context</TabsTrigger>
      </TabsList>

      <TabsContent value="activity" className="space-y-6">
        <LogActivityForm
          profileId={profile.id}
          teamUsers={teamUsers}
          currentUserId={currentUserId}
        />
        <ActivityTimeline
          activities={profile.activities}
          truncated={profile.activitiesTruncated}
        />
      </TabsContent>

      <TabsContent value="connections">
        <ProfileConnectionsSection
          profileId={profile.id}
          connections={profile.connections}
          teamUsers={teamUsers}
          currentUserId={currentUserId}
        />
      </TabsContent>

      <TabsContent value="events">
        {profile.events.length === 0 ? (
          <EmptyState
            variant="dashed"
            title="No events attended"
            description="Add this profile as an attendee on an event."
          >
            <Link
              href="/events"
              className="text-body text-interactive-primary hover:underline"
            >
              Browse events →
            </Link>
          </EmptyState>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-card">
            {profile.events.map((event) => (
              <li key={event.id} className="px-4 py-3">
                <Link
                  href={`/events/${event.id}`}
                  className="text-body font-medium text-foreground hover:underline"
                >
                  {event.title}
                </Link>
                <p className="text-caption text-muted-foreground">
                  {formatEnumLabel(event.eventType)} ·{" "}
                  {formatInteractionDate(event.eventDate)}
                  {event.location ? ` · ${event.location}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </TabsContent>

      <TabsContent value="notes" className="space-y-3">
        <h2 className="text-subheading font-medium text-foreground">
          Relationship context
        </h2>
        <p className="text-caption text-muted-foreground">
          Your own read on this person — how they like to be contacted,
          quirks, anything worth remembering. Separate from the Notes section
          above, which is what they&apos;ve told us themselves via event forms.
        </p>
        {profile.relationship?.notes ? (
          <p className="rounded-lg border border-border bg-card px-4 py-3 text-body text-foreground">
            {profile.relationship.notes}
          </p>
        ) : (
          <EmptyState
            variant="dashed"
            title="No relationship context yet"
            description="Add your own notes about this relationship — how they like to be contacted, useful context, anything worth remembering."
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
