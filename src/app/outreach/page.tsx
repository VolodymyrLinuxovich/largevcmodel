import { prisma } from "@/lib/prisma";
import { OutreachBoard } from "@/components/outreach/outreach-board";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const drafts = await prisma.outreachDraft.findMany({
    include: {
      contact: { include: { company: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Outreach</h1>
        <p className="mt-2 text-sm text-muted-foreground">Draft, approve, and simulate sends with source-backed personalization rationale.</p>
      </div>
      <OutreachBoard initialDrafts={drafts} />
    </div>
  );
}
