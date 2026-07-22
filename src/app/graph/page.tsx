import Link from "next/link";
import { IntegrationService } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { RelationshipGraph } from "@/components/graph/relationship-graph";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { getWorkspaceData, integrationConnected } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function GraphPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const connected = integrationConnected(data, IntegrationService.GMAIL) || integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) || integrationConnected(data, IntegrationService.GOOGLE_CALENDAR);
  const edges = connected ? await prisma.relationshipEdge.findMany({ where: { userId: data.user.id }, orderBy: { strength: "desc" } }) : [];

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="RELATIONSHIP GRAPH / EVIDENCE"
        title="Map warm paths only when data supports them."
        body="Edges represent Gmail communication, calendar meetings, contact records, shared organizations, or manually confirmed relationships. Unsupported relationships are not inferred."
        actions={<Button asChild variant="outline"><Link href="/settings">Connect Sources</Link></Button>}
      />
      <Section title="Graph workspace">
        {!connected ? (
          <EmptyState title="No relationship data connected" body="Connect Gmail, Google Contacts, or Calendar to build relationship edges. The graph does not include sample nodes." />
        ) : edges.length ? (
          <RelationshipGraph edges={edges} />
        ) : (
          <EmptyState title="No relationship edges found" body="Connected records have not produced supported relationship edges yet. Sync sources or add confirmed relationships." />
        )}
      </Section>
    </PageFrame>
  );
}
