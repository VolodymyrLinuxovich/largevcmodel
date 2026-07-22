import { prisma } from "@/lib/prisma";
import { ResearchConsole } from "@/components/research/research-console";

export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const recentRuns = await prisma.researchRun.findMany({
    orderBy: { createdAt: "desc" },
    take: 6,
    select: {
      id: true,
      query: true,
      provider: true,
      createdAt: true,
    },
  });

  return <ResearchConsole recentRuns={recentRuns} />;
}
