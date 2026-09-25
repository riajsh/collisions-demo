"use client";

import { useRouter } from "next/navigation";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { OrgUser } from "@/lib/data/users";
import { VIEW_AS_OWNER_COOKIE } from "@/lib/view-as/constants";

type ViewAsSelectorProps = {
  teamUsers: OrgUser[];
  activeOwnerId?: string;
};

function writeViewAsCookie(ownerId: string | null) {
  const maxAge = 60 * 60 * 24 * 30;
  if (ownerId) {
    document.cookie = `${VIEW_AS_OWNER_COOKIE}=${encodeURIComponent(ownerId)}; path=/; max-age=${maxAge}; SameSite=Lax`;
  } else {
    document.cookie = `${VIEW_AS_OWNER_COOKIE}=; path=/; max-age=0; SameSite=Lax`;
  }
}

export function ViewAsSelector({
  teamUsers,
  activeOwnerId,
}: ViewAsSelectorProps) {
  const router = useRouter();

  function updateViewAs(value: string) {
    const ownerId = value === "all" ? null : value;
    writeViewAsCookie(ownerId);
    router.refresh();
  }

  return (
    <div className="mb-3 space-y-1 rounded-md border border-sidebar-border bg-sidebar-accent/20 px-3 py-2.5">
      <p className="text-caption font-medium text-muted-foreground">View as</p>
      <Select value={activeOwnerId ?? "all"} onValueChange={updateViewAs}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="Everyone" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Everyone</SelectItem>
          {teamUsers.map((user) => (
            <SelectItem key={user.id} value={user.id}>
              {user.fullName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
