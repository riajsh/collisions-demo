import { AdminPage } from "@/components/admin/admin-page";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";

export default function ConnectSettingsPage() {
  return (
    <AdminPage
      title="Connect Settings"
      description='Controls for the auto-surfaced "Who to reconnect with" sections.'
    >
      <EmptyState
        variant="dashed"
        title="Connect settings — Phase 2"
        description="Dismiss duration, team-wide dismissals, and resurfacing rules aren't built yet. Connect suggestions themselves are live on the Connect page."
      >
        <Badge variant="outline">Phase 2</Badge>
      </EmptyState>
    </AdminPage>
  );
}
