import { PageHeader } from "@/components/app-shell/page-header";
import { ConnectSections } from "@/components/connect/connect-sections";
import {
  getEmergingSuggestions,
  getIntroduceSuggestions,
  getReconnectSuggestions,
} from "@/lib/computed/connect";

export default async function ConnectPage() {
  const [reconnect, introduce, emerging] = await Promise.all([
    getReconnectSuggestions(20),
    getIntroduceSuggestions(20),
    getEmergingSuggestions(20),
  ]);

  return (
    <>
      <PageHeader
        title="Connect"
        description="Automatic suggestions based on your network — reconnect, introduce, emerging."
      >
        <BadgeGeneratedLabel />
      </PageHeader>
      <div className="px-8 py-6">
        <ConnectSections
          reconnect={reconnect}
          introduce={introduce}
          emerging={emerging}
        />
      </div>
    </>
  );
}

function BadgeGeneratedLabel() {
  return (
    <span className="rounded-md border border-border bg-muted/50 px-3 py-1.5 text-caption text-muted-foreground">
      Automatic, based on your network
    </span>
  );
}
