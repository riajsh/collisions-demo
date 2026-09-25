"use client";

import { useRouter } from "next/navigation";

import { OwnerDot } from "@/components/profiles/owner-dot";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgUser } from "@/lib/data/users";
import { VIEW_AS_OWNER_COOKIE } from "@/lib/view-as/constants";

type OverviewOwnerSelectorProps = {
  teamUsers: OrgUser[];
  activeOwnerId?: string;
  syncViewAsCookie?: boolean;
};

function writeViewAsCookie(ownerId: string | null) {
  const maxAge = 60 * 60 * 24 * 30;
  if (ownerId) {
    document.cookie = `${VIEW_AS_OWNER_COOKIE}=${encodeURIComponent(ownerId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } else {
    document.cookie = `${VIEW_AS_OWNER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function OverviewOwnerSelector({
  teamUsers,
  activeOwnerId,
  syncViewAsCookie = false,
}: OverviewOwnerSelectorProps) {
  const router = useRouter();

  function updateOwner(value: string) {
    const ownerId = value === "all" ? null : value;

    if (syncViewAsCookie) {
      writeViewAsCookie(ownerId);
    }

    const params = new URLSearchParams(window.location.search);

    if (ownerId) {
      params.set("owner", ownerId);
    } else {
      params.delete("owner");
    }

    const query = params.toString();
    router.push(query ? `/?${query}` : "/");
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <p className="text-caption text-muted-foreground">Owner</p>
      <Select value={activeOwnerId ?? "all"} onValueChange={updateOwner}>
        <SelectTrigger size="sm" className="min-w-[180px]">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="all">Everyone</SelectItem>
          {teamUsers.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              <span className="inline-flex items-center gap-2">
                <OwnerDot userId={user.id} />
                {user.fullName}
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
