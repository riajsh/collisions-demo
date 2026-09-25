import "server-only";

import { cookies } from "next/headers";

import type { AppUser } from "@/lib/auth/session";
import type { OrgUser } from "@/lib/data/users";

import { VIEW_AS_OWNER_COOKIE } from "./constants";

export async function resolveViewAsOwnerId(
  urlOwnerId: string | undefined,
  user: AppUser,
  teamUsers: OrgUser[],
): Promise<string | undefined> {
  if (urlOwnerId) {
    return teamUsers.some((member) => member.id === urlOwnerId)
      ? urlOwnerId
      : undefined;
  }

  if (user.role !== "admin") {
    return undefined;
  }

  const cookieStore = await cookies();
  const cookieValue = cookieStore.get(VIEW_AS_OWNER_COOKIE)?.value;

  if (!cookieValue) {
    return undefined;
  }

  return teamUsers.some((member) => member.id === cookieValue)
    ? cookieValue
    : undefined;
}
