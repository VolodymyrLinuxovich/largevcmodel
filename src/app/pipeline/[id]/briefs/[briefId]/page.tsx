import Link from "next/link";
import { notFound } from "next/navigation";
import { MeetingBriefView } from "@/components/briefs/meeting-brief-view";
import { Button } from "@/components/ui/button";
import { HeroHeader, PageFrame, SignInPanel } from "@/components/workspace/core";
import { getMeetingBrief } from "@/lib/briefs/service";
import { prisma } from "@/lib/prisma";
import { formatTime } from "@/lib/utils";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MeetingBriefPage({ params }: { params: Promise<{ id: string; briefId: string }> }) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { id, briefId } = await params;
  const brief = await getMeetingBrief(prisma, data.user.id, briefId);
  if (!brief || brief.opportunityId !== id) notFound();

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="MEETING BRIEF / EVIDENCE SNAPSHOT"
        title={brief.title}
        body={`Generated ${formatTime(brief.generatedAt)} from stored workspace evidence. ${brief.content.counts.claims} claims, ${brief.content.counts.sources} cited sources, ${brief.content.counts.emails} email threads and ${brief.content.counts.meetings} calendar events were considered. This snapshot does not change when new evidence arrives; generate a new brief to refresh it.`}
        actions={
          <Button asChild variant="outline">
            <Link href={`/pipeline/${id}`}>Back to opportunity</Link>
          </Button>
        }
      />
      <MeetingBriefView content={brief.content} />
    </PageFrame>
  );
}
