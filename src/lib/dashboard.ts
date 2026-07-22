import type { PrismaClient } from "@prisma/client";

export async function getDashboardSnapshot(prisma: PrismaClient) {
  const [contacts, drafts, replies, meetings, runs, auditEvents] = await Promise.all([
    prisma.contact.findMany({
      include: {
        company: true,
        fitScores: { orderBy: { createdAt: "desc" }, take: 1 },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.outreachDraft.findMany({ include: { contact: { include: { company: true } } }, orderBy: { updatedAt: "desc" } }),
    prisma.reply.findMany(),
    prisma.meeting.findMany({ include: { contact: { include: { company: true } }, partner: true }, orderBy: { startTime: "asc" } }),
    prisma.researchRun.findMany({ orderBy: { createdAt: "desc" }, take: 6 }),
    prisma.auditEvent.findMany({ include: { affectedFounder: true }, orderBy: { timestamp: "desc" }, take: 6 }),
  ]);

  const sent = drafts.filter((draft) => draft.status === "Sent").length;
  const responseRate = sent ? Math.round((replies.length / sent) * 100) : replies.length ? 100 : 0;
  const scores = contacts.flatMap((contact) => contact.fitScores.map((score) => score.overall));
  const averageFitScore = scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length) : 0;
  const pipeline = groupByStatus(contacts.map((contact) => contact.crmStatus));
  const outreach = groupByStatus(drafts.map((draft) => draft.status));

  return {
    metrics: {
      candidateCount: contacts.length,
      responseRate,
      meetingsBooked: meetings.length,
      averageFitScore,
    },
    pipeline: Object.entries(pipeline).map(([name, value]) => ({ name, value })),
    outreach: Object.entries(outreach).map(([name, value]) => ({ name, value })),
    recentRuns: runs,
    upcomingMeetings: meetings,
    topCandidates: contacts
      .filter((contact) => contact.fitScores[0])
      .sort((a, b) => (b.fitScores[0]?.overall ?? 0) - (a.fitScores[0]?.overall ?? 0))
      .slice(0, 5),
    auditEvents,
  };
}

function groupByStatus(statuses: string[]) {
  return statuses.reduce<Record<string, number>>((acc, status) => {
    acc[status] = (acc[status] ?? 0) + 1;
    return acc;
  }, {});
}
