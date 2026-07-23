import Link from "next/link";
import { IntegrationService } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { ResearchConsole } from "@/components/workspace/research-console";
import { getWorkspaceData, integrationConnected } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const contactsConnected =
    integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) ||
    integrationConnected(data, IntegrationService.GMAIL) ||
    integrationConnected(data, IntegrationService.GOOGLE_CALENDAR);
  const providerConfigured = data.configuration.researchProvider === "hermes" && data.configuration.researchConfigured;

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="RESEARCH / SOURCE DISCOVERY"
        title="Investigate your network without losing provenance."
        body="Search people, companies, organizations, conversations, and meetings from connected records. Public claims stay unavailable until a research provider can verify them."
        actions={<Button asChild variant="outline"><Link href="/settings">Provider Settings</Link></Button>}
      />
      <Section title="Research workspace">
        {!contactsConnected ? (
          <EmptyState title="Connect relationship data first" body="Network search starts from real Contacts, Gmail, or Calendar records. Connect and sync at least one source before running a query." action={<Button asChild><Link href="/settings">Connect Sources</Link></Button>} />
        ) : (
          <ResearchConsole
            provider={data.configuration.researchProvider}
            providerConfigured={providerConfigured}
            contactsConnected={contactsConnected}
          />
        )}
      </Section>
    </PageFrame>
  );
}
