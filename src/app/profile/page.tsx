import { StartupWorkspace } from "@/components/startups/startup-workspace";
import { HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function StartupProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    const data = await getWorkspaceData();
    return <SignInPanel data={data} />;
  }

  const startups = await prisma.startupProfile.findMany({
    where: { userId: user.id },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    include: {
      pitchDecks: {
        where: { deletedAt: null },
        orderBy: { uploadedAt: "desc" },
        take: 1,
        include: {
          extractions: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { fields: { orderBy: { fieldKey: "asc" } } },
          },
        },
      },
      savedLists: {
        include: { _count: { select: { people: true } } },
      },
    },
  });

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="STARTUP PROFILE / INTELLIGENCE CONTEXT"
        title="Build the profile that drives discovery."
        body="Create a structured company profile, upload a pitch deck, review extracted fields, and define the criteria used to discover investors, operators, advisors, researchers, customers, and strategic partners."
      />
      <Section eyebrow="Founder data room" title="Startup intelligence profile">
        <StartupWorkspace
          startups={startups.map((startup) => ({
            id: startup.id,
            name: startup.name,
            website: startup.website,
            logoUrl: startup.logoUrl,
            oneLineDescription: startup.oneLineDescription,
            description: startup.description,
            industry: startup.industry,
            subIndustries: startup.subIndustries,
            product: startup.product,
            problem: startup.problem,
            solution: startup.solution,
            targetCustomers: startup.targetCustomers,
            customerSegments: startup.customerSegments,
            businessModel: startup.businessModel,
            revenueModel: startup.revenueModel,
            fundingStage: startup.fundingStage,
            fundingTarget: startup.fundingTarget,
            minCheckSize: startup.minCheckSize,
            maxCheckSize: startup.maxCheckSize,
            headquarters: startup.headquarters,
            targetGeographies: startup.targetGeographies,
            traction: startup.traction,
            revenue: startup.revenue,
            customerCount: startup.customerCount,
            pilots: startup.pilots,
            partnerships: startup.partnerships,
            team: startup.team,
            founderBackgrounds: startup.founderBackgrounds,
            keywords: startup.keywords,
            technologies: startup.technologies,
            moat: startup.moat,
            competitors: startup.competitors,
            preferredInvestorTypes: startup.preferredInvestorTypes,
            excludedInvestors: startup.excludedInvestors,
            excludedOrganizations: startup.excludedOrganizations,
            fundraisingStatus: startup.fundraisingStatus,
            fundraisingTimeline: startup.fundraisingTimeline,
            customNotes: startup.customNotes,
            searchCriteria: startup.searchCriteria && typeof startup.searchCriteria === "object" && !Array.isArray(startup.searchCriteria) ? startup.searchCriteria : null,
            profileCompleteness: startup.profileCompleteness,
            updatedAt: startup.updatedAt.toISOString(),
            pitchDeck: startup.pitchDecks[0]
              ? {
                  id: startup.pitchDecks[0].id,
                  filename: startup.pitchDecks[0].filename,
                  fileSize: startup.pitchDecks[0].fileSize,
                  uploadedAt: startup.pitchDecks[0].uploadedAt.toISOString(),
                  extractionStatus: startup.pitchDecks[0].extractionStatus,
                  extractionConfidence: startup.pitchDecks[0].extractionConfidence,
                  extractionWarnings: startup.pitchDecks[0].extractionWarnings,
                  lastProcessedAt: startup.pitchDecks[0].lastProcessedAt?.toISOString() ?? null,
                  extraction: startup.pitchDecks[0].extractions[0]
                    ? {
                        id: startup.pitchDecks[0].extractions[0].id,
                        status: startup.pitchDecks[0].extractions[0].status,
                        extractionConfidence: startup.pitchDecks[0].extractions[0].extractionConfidence,
                        fields: startup.pitchDecks[0].extractions[0].fields.map((field) => ({
                          id: field.id,
                          fieldKey: field.fieldKey,
                          extractedValue: field.extractedValue,
                          currentValue: field.currentValue,
                          confidence: field.confidence,
                          sourcePage: field.sourcePage,
                          status: field.status,
                        })),
                      }
                    : null,
                }
              : null,
            savedLists: startup.savedLists.map((list) => ({ id: list.id, name: list.name, count: list._count.people })),
          }))}
        />
      </Section>
    </PageFrame>
  );
}
