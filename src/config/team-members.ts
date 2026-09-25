import teamConfig from "@/config/team-members.json";

type TeamMemberRole = "admin" | "member";

export type TeamMember = {
  id: string;
  email: string;
  fullName: string;
  role: TeamMemberRole;
  colourToken: string;
  title?: string;
  devLogin?: boolean;
};

export const LOCAL_DEV_ORG_ID = teamConfig.localDevOrgId;
export const ORG_NAME = teamConfig.orgName;
export const ORG_SLUG = teamConfig.orgSlug;

export const TEAM_MEMBERS = teamConfig.members as TeamMember[];

export type TeamMemberConfig = TeamMember;

export const TEAM_MEMBER_TITLES: Record<string, string> = Object.fromEntries(
  TEAM_MEMBERS.filter((member) => member.title).map((member) => [
    member.email.toLowerCase(),
    member.title!,
  ]),
);

export function getDevSeedAccount(): TeamMember | undefined {
  return TEAM_MEMBERS.find((member) => member.devLogin);
}
