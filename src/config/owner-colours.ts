import { TEAM_MEMBERS } from "@/config/team-members";

export const OWNER_COLOURS: Record<string, string> = Object.fromEntries(
  TEAM_MEMBERS.map((member) => [member.id, member.colourToken]),
);

export function ownerColour(userId: string): string {
  return OWNER_COLOURS[userId] ?? "var(--color-owner-default)";
}
