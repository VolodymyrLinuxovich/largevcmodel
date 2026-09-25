import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { NewOpportunityForm } from "@/components/pipeline/new-opportunity-form";
import { PipelineBoard } from "@/components/pipeline/pipeline-board";
import { ThesisForm } from "@/components/pipeline/thesis-form";
import { listPipeline } from "@/lib/pipeline/queries";
import { listTheses } from "@/lib/pipeline/thesis";
import { prisma } from "@/lib/prisma";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function PipelinePage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const userId = data.user.id;
  const [cards, theses, companies] = await Promise.all([
    listPipeline(prisma, userId),
    listTheses(prisma, userId),
    prisma.company.findMany({ where: { userId }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 1000 }),
  ]);
  const now = new Date();

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="PIPELINE / INVESTMENT OPPORTUNITIES"
        title="Deal pipeline."
        body="Track opportunities from sourcing to investment committee. Stage changes are versioned, recorded in the opportunity history and audit log, and only user-entered or connected-account evidence is shown."
      />
      <Section eyebrow="Board" title={`${cards.filter((card) => card.stage !== "PASSED" && card.stage !== "INVESTED").length} open opportunities`}>
        {cards.length ? (
          <PipelineBoard cards={cards} now={now} />
        ) : (
          <EmptyState title="No opportunities yet" body="Add a company you are actively evaluating below. Search results and research runs are not turned into deals automatically." />
        )}
      </Section>
      <Section eyebrow="New opportunity" title="Add a company to the pipeline">
        <NewOpportunityForm companies={companies} theses={theses.map((thesis) => ({ id: thesis.id, name: thesis.name }))} />
      </Section>
      <Section eyebrow="Investment theses" title="Theses used for fit scoring">
        {theses.length ? (
          <ul className="mb-8 divide-y divide-border border-y border-border">
            {theses.map((thesis) => (
              <li key={thesis.id} className="grid gap-1 py-3 text-sm md:grid-cols-[240px_1fr]">
                <p className="font-semibold">
                  {thesis.name}
                  {thesis.active ? "" : " (inactive)"}
                </p>
                <p className="text-xs leading-5 text-muted-foreground">
                  Sectors: {thesis.targetSectors.join(", ") || "not set"} / Stages: {thesis.stages.join(", ") || "not set"} / Geographies:{" "}
                  {thesis.geographies.join(", ") || "not set"}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-6 text-sm text-muted-foreground">No thesis saved. Fit scores will report thesis criteria as missing until one exists.</p>
        )}
        <ThesisForm />
      </Section>
    </PageFrame>
  );
}
