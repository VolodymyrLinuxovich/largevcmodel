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
  const contactsConnected = integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) || integrationConnected(data, IntegrationService.GMAIL);
  const providerConfigured = data.configuration.researchProvider === "hermes" && data.configuration.researchConfigured;

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="RESEARCH / SOURCE DISCOVERY"
        title="Investigate people and companies without losing provenance."
        body="Search connected account records, select a real subject, call the configured research provider, preserve source URLs, and separate public claims from AI inference or unavailable facts."
        actions={<Button asChild variant="outline"><Link href="/settings">Provider Settings</Link></Button>}
      />
      <Section title="Research workspace">
        {!contactsConnected ? (
          <EmptyState title="Connect relationship data first" body="Research starts from real contacts or companies in your workspace. Connect Google Contacts or Gmail before running a query." action={<Button asChild><Link href="/settings">Connect Sources</Link></Button>} />
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
