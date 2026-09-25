import { AppProviders } from "@/components/app-shell/app-providers";
import { AppSidebar } from "@/components/app-shell/app-sidebar";
import { requireUser } from "@/lib/auth/session";
import { findNavProfileIdForEmail, listOrgUsers } from "@/lib/data/users";
import { resolveViewAsOwnerId } from "@/lib/view-as/resolve";

export default async function AppLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await requireUser();
  const teamUsers = user.role === "admin" ? await listOrgUsers() : [];
  const [profileId, viewAsOwnerId] = await Promise.all([
    findNavProfileIdForEmail(user.email),
    resolveViewAsOwnerId(undefined, user, teamUsers),
  ]);

  return (
    <div className="fixed inset-0 flex overflow-hidden bg-background">
      <AppSidebar
        user={user}
        profileId={profileId}
        teamUsers={teamUsers}
        viewAsOwnerId={viewAsOwnerId}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-y-auto overscroll-y-contain">
        <AppProviders>{children}</AppProviders>
      </div>
    </div>
  );
}
