import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PeopleSearchWorkspace } from "@/components/people/people-search-workspace";
import { HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getPeopleDiscoveryProviderStatus } from "@/lib/people/provider";
import { prisma } from "@/lib/prisma";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams?: Promise<{ q?: string }> }) {
  const user = await getCurrentUser();
  if (!user) {
    const data = await getWorkspaceData();
    return <SignInPanel data={data} />;
  }

  const [{ q = "" }, startups, providerStatus] = await Promise.all([
    searchParams ? searchParams : Promise.resolve({ q: "" }),
    prisma.startupProfile.findMany({
      where: { userId: user.id },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: {
        pitchDecks: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: "desc" },
          take: 1,
          select: { extractionStatus: true },
        },
      },
    }),
    getPeopleDiscoveryProviderStatus(),
  ]);

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="PEOPLE DISCOVERY / EXTERNAL INTELLIGENCE"
        title="Find the people your company should know."
        body="Search public people and investor sources from your startup profile, then enrich externally discovered candidates with private Gmail and Google Contacts relationship evidence."
        actions={<Button asChild variant="outline"><Link href="/settings">Provider settings</Link></Button>}
      />
      <Section eyebrow="People search" title="External discovery first. Relationship data second.">
        <PeopleSearchWorkspace
          initialQuery={q}
          providerStatus={providerStatus}
          startups={startups.map((startup) => ({
            id: startup.id,
            name: startup.name,
            profileCompleteness: startup.profileCompleteness,
            pitchDeckStatus: startup.pitchDecks[0]?.extractionStatus ?? null,
          }))}
        />
      </Section>
    </PageFrame>
  );
}
