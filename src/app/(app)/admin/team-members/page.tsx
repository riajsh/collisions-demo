import { AdminPage } from "@/components/admin/admin-page";
import { TeamMembersList } from "@/components/admin/team-members-list";
import { listOrgUsers } from "@/lib/data/users";

export default async function TeamMembersPage() {
  const users = await listOrgUsers();

  return (
    <AdminPage
      title="Team Members"
      description="People on your team who can be assigned as Relationship Owners on profiles."
    >
      <TeamMembersList users={users} />
    </AdminPage>
  );
}
