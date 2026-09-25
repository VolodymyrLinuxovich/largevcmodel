import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BriefGenerator } from "@/components/briefs/brief-generator";
import { GenerateMemoButton } from "@/components/memos/memo-actions";
import { ContactLinker } from "@/components/pipeline/contact-linker";
import { enumLabel } from "@/components/pipeline/labels";
import { OpportunityFieldsForm } from "@/components/pipeline/opportunity-fields-form";
import { OpportunityTimeline } from "@/components/pipeline/opportunity-timeline";
import { StageChangeForm } from "@/components/pipeline/stage-change-form";
import { HealthStateBadge } from "@/components/relationships/health-state-badge";
import { WatchButton } from "@/components/watchlist/watch-button";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import { HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { listMeetingBriefs, upcomingMeetingsForOpportunity } from "@/lib/briefs/service";
import { listInvestmentMemos } from "@/lib/memos/service";
import { getOpportunityDetail } from "@/lib/pipeline/queries";
import { STAGE_LABELS } from "@/lib/pipeline/stages";
import { listTheses } from "@/lib/pipeline/thesis";
import { prisma } from "@/lib/prisma";
import { formatDate, formatTime } from "@/lib/utils";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function OpportunityPage({ params }: { params: Promise<{ id: string }> }) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { id } = await params;
  const [opportunity, theses, briefs, upcomingMeetings, memos, watchItems] = await Promise.all([
    getOpportunityDetail(prisma, data.user.id, id),
    listTheses(prisma, data.user.id),
    listMeetingBriefs(prisma, data.user.id, id),
    upcomingMeetingsForOpportunity(prisma, data.user.id, id),
    listInvestmentMemos(prisma, data.user.id, id),
    prisma.watchlistItem.findMany({
      where: { userId: data.user.id, OR: [{ opportunityId: id }, { company: { opportunities: { some: { id } } } }] },
      select: { id: true, opportunityId: true, companyId: true },
    }),
  ]);
  if (!opportunity) notFound();
  const { company, currentFitScore: fit } = opportunity;
  const criteria = fit && fit.criteria && typeof fit.criteria === "object" && !Array.isArray(fit.criteria) ? (fit.criteria as Record<string, number>) : null;

  return (
    <PageFrame>
      <HeroHeader
        eyebrow={`PIPELINE / ${STAGE_LABELS[opportunity.stage].toUpperCase()}`}
        title={company.name}
        body={[opportunity.title, company.sector, company.stage, company.geography].filter(Boolean).join(" / ") || "Company details have not been provided."}
        actions={
          <>
            <WatchButton
              entityType="OPPORTUNITY"
              targetId={opportunity.id}
              itemId={watchItems.find((item) => item.opportunityId === opportunity.id)?.id ?? null}
              label="opportunity"
            />
            <WatchButton
              entityType="COMPANY"
              targetId={company.id}
              itemId={watchItems.find((item) => item.companyId === company.id)?.id ?? null}
              label="company"
            />
            <Button asChild variant="outline">
              <Link href="/pipeline">Back to pipeline</Link>
            </Button>
          </>
        }
      />

      <section className="grid border-b border-border lg:grid-cols-[1fr_420px]">
        <div className="border-b border-border px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <p className="eyebrow mb-4">Summary</p>
          <dl className="divide-y divide-border border-y border-border text-sm">
            {[
              ["Stage", `${STAGE_LABELS[opportunity.stage]} since ${formatDate(opportunity.stageChangedAt)}`],
              ["Priority", enumLabel(opportunity.priority)],
              ["Owner", opportunity.ownerName ?? "Unassigned"],
              ["Source", `${enumLabel(opportunity.source)}${opportunity.sourceDetail ? ` / ${opportunity.sourceDetail}` : ""}`],
              ["Introduced by", opportunity.introducedBy ? opportunity.introducedBy.fullName ?? opportunity.introducedBy.primaryEmail : "Not recorded"],
              ["Thesis", opportunity.thesis?.name ?? "Most recent active thesis"],
              ["Website", company.website ?? "Not provided"],
              ...(opportunity.passReason ? [["Pass reason", opportunity.passReason]] : []),
            ].map(([label, value]) => (
              <div key={label} className="grid gap-2 py-3 sm:grid-cols-[160px_1fr]">
                <dt className="eyebrow">{label}</dt>
                <dd className="break-words">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="px-5 py-8 sm:px-8 lg:px-10">
          <p className="eyebrow mb-4">Change stage</p>
          <StageChangeForm opportunityId={opportunity.id} stage={opportunity.stage} version={opportunity.version} />
        </div>
      </section>

      <section className="grid border-b border-border lg:grid-cols-2">
        <div className="border-b border-border px-5 py-8 sm:px-8 lg:border-b-0 lg:border-r lg:px-10">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <p className="eyebrow">Thesis fit</p>
            <ApiActionButton endpoint={`/api/opportunities/${opportunity.id}/score`} variant="outline" size="sm" refreshOnSuccess>
              {fit ? "Rescore" : "Score against thesis"}
            </ApiActionButton>
          </div>
          {fit ? (
            <div>
              <div className="flex items-baseline gap-3">
                <p className="font-mono text-4xl">{fit.overall}</p>
                <Badge variant="outline">confidence {fit.confidence}</Badge>
              </div>
              <p className="mt-2 font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
                {fit.modelOrProvider} / {formatDate(fit.calculatedAt)}
              </p>
              {criteria ? (
                <ul className="mt-4 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                  {Object.entries(criteria).map(([key, value]) => (
                    <li key={key} className="border border-border px-2 py-1.5">
                      <span className="block text-muted-foreground">{enumLabel(key.replace(/([A-Z])/g, "_$1"))}</span>
                      <span className="font-mono">{value}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {fit.missingInfo.length ? <p className="mt-4 text-xs leading-5 text-[hsl(39_32%_70%)]">Missing: {fit.missingInfo.join(" ")}</p> : null}
              <p className="mt-3 text-xs leading-5 text-muted-foreground">Scores are prioritization heuristics, not investment judgments.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Not scored yet.</p>
          )}
        </div>
        <div className="px-5 py-8 sm:px-8 lg:px-10">
          <p className="eyebrow mb-4">Relationship health</p>
          {opportunity.relationship.status === "ASSESSED" ? (
            <div className="flex flex-wrap items-center gap-3">
              <HealthStateBadge state={opportunity.relationship.state} score={opportunity.relationship.score} />
              <span className="text-xs text-muted-foreground">
                {opportunity.relationship.calculatedAt ? `calculated ${formatDate(opportunity.relationship.calculatedAt)}` : ""}
              </span>
            </div>
          ) : null}
          <p className="mt-3 text-sm text-muted-foreground">{opportunity.relationship.explanation}</p>
        </div>
      </section>

      <Section eyebrow="People" title="Linked people">
        <ContactLinker
          opportunityId={opportunity.id}
          linked={opportunity.contacts.map((link) => ({
            contactId: link.contact.id,
            name: link.contact.fullName ?? link.contact.primaryEmail ?? "Unnamed contact",
            detail: [link.contact.title, link.contact.organization].filter(Boolean).join(", ") || null,
            role: link.role,
            healthState: link.contact.healthState,
            healthScore: link.contact.healthScore,
          }))}
        />
      </Section>

      <Section eyebrow="Preparation" title="Meeting briefs">
        <BriefGenerator
          opportunityId={opportunity.id}
          meetings={upcomingMeetings.map((meeting) => ({ id: meeting.id, label: `${meeting.title ?? "Untitled meeting"} / ${formatTime(meeting.startsAt)}` }))}
        />
        {briefs.length ? (
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {briefs.map((brief) => (
              <li key={brief.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <Link href={`/pipeline/${opportunity.id}/briefs/${brief.id}`} className="underline-offset-4 hover:underline">
                  {brief.title}
                </Link>
                <span className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
                  {brief.claimCount} claims / {brief.sourceCount} sources / {formatTime(brief.generatedAt)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">No briefs generated yet.</p>
        )}
      </Section>

      <Section eyebrow="Investment committee" title="IC memos">
        <p className="mb-5 max-w-3xl text-sm text-muted-foreground">
          Memos organize stored evidence for human judgment. They separate connected-account, public-source and user-provided evidence from AI
          inference and missing information, and never include a recommendation.
        </p>
        <GenerateMemoButton opportunityId={opportunity.id} />
        {memos.length ? (
          <ul className="mt-6 divide-y divide-border border-y border-border">
            {memos.map((memo) => (
              <li key={memo.id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
                <Link href={`/pipeline/${opportunity.id}/memos/${memo.id}`} className="underline-offset-4 hover:underline">
                  {memo.title}
                </Link>
                <span className="flex items-center gap-3">
                  <Badge variant={memo.status === "FINALIZED" ? "success" : "outline"}>{enumLabel(memo.status)}</Badge>
                  <span className="font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">{formatTime(memo.generatedAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">No memo drafts yet.</p>
        )}
      </Section>

      <Section eyebrow="Details" title="Next action and notes">
        <OpportunityFieldsForm
          theses={theses.map((thesis) => ({ id: thesis.id, name: thesis.name }))}
          opportunity={{
            id: opportunity.id,
            version: opportunity.version,
            priority: opportunity.priority,
            ownerName: opportunity.ownerName,
            nextAction: opportunity.nextAction,
            nextActionAt: opportunity.nextActionAt ? opportunity.nextActionAt.toISOString().slice(0, 10) : null,
            notes: opportunity.notes,
            thesisId: opportunity.thesisId,
          }}
        />
      </Section>

      <Section eyebrow="History" title="Stage and activity history">
        <OpportunityTimeline events={opportunity.events} />
      </Section>
    </PageFrame>
  );
}
