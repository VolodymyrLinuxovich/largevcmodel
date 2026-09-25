import { citationMapFor, EvidenceList, GeneratedList, MissingList, SourceAppendix } from "@/components/evidence/evidence-list";
import { KeyFactsTable } from "@/components/evidence/key-facts";
import { enumLabel } from "@/components/pipeline/labels";
import { HealthStateBadge } from "@/components/relationships/health-state-badge";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/workspace/core";
import type { RelationshipHealthState } from "@/lib/domain/relationship-health";
import type { InvestmentMemoContent } from "@/lib/memos/assemble";
import { STAGE_LABELS, type OpportunityStageValue } from "@/lib/pipeline/stages";
import { formatDate } from "@/lib/utils";

export function MemoView({ content }: { content: InvestmentMemoContent }) {
  const citations = citationMapFor(content.sourceAppendix);
  const alignment = content.thesisAlignment;
  const score = content.scoreBreakdown;
  return (
    <>
      <Section eyebrow="1" title="Executive summary">
        <p role="note" className="mb-5 border-l-2 border-primary pl-4 text-sm leading-6">
          {content.notice}
        </p>
        <ul className="list-disc space-y-2 pl-5 text-sm leading-6">
          {content.executiveSummary.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <ul className="mt-5 flex flex-wrap gap-2" aria-label="Evidence mix">
          {content.evidenceMix.map((entry) => (
            <li key={entry.evidenceClass}>
              <Badge variant="outline">
                {entry.label}: {entry.count}
              </Badge>
            </li>
          ))}
        </ul>
      </Section>

      <Section eyebrow="2" title="Company">
        <EvidenceList items={content.company} citations={citations} empty="No company information has been provided or sourced." />
      </Section>

      <Section eyebrow="3" title="Thesis alignment">
        {alignment.status === "COMPARED" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px] text-left text-sm">
              <caption className="mb-3 text-left text-xs text-muted-foreground">
                {alignment.thesisName}: {alignment.explanation}
              </caption>
              <thead className="border-b border-border font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3">Criterion</th>
                  <th scope="col" className="py-2 pr-3">Company (user provided)</th>
                  <th scope="col" className="py-2 pr-3">Thesis</th>
                  <th scope="col" className="py-2">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {alignment.rows.map((row) => (
                  <tr key={row.criterion}>
                    <th scope="row" className="py-2 pr-3 font-normal">{row.criterion}</th>
                    <td className="py-2 pr-3">{row.companyValue ?? "Unknown"}</td>
                    <td className="py-2 pr-3">{row.thesisValues.join(", ") || "Not defined"}</td>
                    <td className="py-2">
                      <Badge variant={row.match === "MATCH" ? "success" : row.match === "NO_MATCH" ? "warning" : "muted"}>{enumLabel(row.match)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{alignment.explanation}</p>
        )}
      </Section>

      <Section eyebrow="4" title="Market and problem evidence">
        <EvidenceList items={content.market} citations={citations} empty="No established market or problem evidence." />
      </Section>

      <Section eyebrow="5" title="Product and technology evidence">
        <EvidenceList items={content.product} citations={citations} empty="No established product or technology evidence." />
      </Section>

      <Section eyebrow="6" title="Team">
        {content.team.people.length ? (
          <ul className="mb-5 divide-y divide-border border-y border-border">
            {content.team.people.map((person) => (
              <li key={person.contactId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                <span>
                  {person.name} <span className="text-muted-foreground">({enumLabel(person.role)})</span>
                </span>
                <HealthStateBadge state={person.healthState as RelationshipHealthState} score={person.healthScore} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-5 text-sm text-muted-foreground">No founders or executives are linked.</p>
        )}
        <EvidenceList items={content.team.evidence} citations={citations} empty="No established team evidence." />
      </Section>

      <Section eyebrow="7" title="Traction">
        <p className="mb-4 text-sm text-muted-foreground">Shown only when supported by stored evidence.</p>
        <KeyFactsTable facts={content.traction} citations={citations} />
      </Section>

      <Section eyebrow="8" title="Relationship context">
        <ul className="divide-y divide-border border-y border-border">
          {content.relationshipContext.people.map((person) => (
            <li key={person.contactId} className="grid gap-1 py-3 text-sm md:grid-cols-[1fr_auto]">
              <span>
                {person.name} <span className="text-muted-foreground">({enumLabel(person.role)})</span>
                {person.lastInteractionAt ? <span className="text-muted-foreground"> / last interaction {formatDate(person.lastInteractionAt)}</span> : null}
              </span>
              <HealthStateBadge state={person.healthState as RelationshipHealthState} score={person.healthScore} />
            </li>
          ))}
        </ul>
        {!content.relationshipContext.people.length ? <p className="text-sm text-muted-foreground">No linked people.</p> : null}
        <p className="mt-5 text-sm">
          Warm introductions:{" "}
          {content.relationshipContext.warmIntroductions.length
            ? content.relationshipContext.warmIntroductions.map((intro) => intro.name).join(", ")
            : "none recorded"}
        </p>
        {content.relationshipContext.stageHistory.length ? (
          <ol className="mt-5 space-y-1 text-xs text-muted-foreground">
            {content.relationshipContext.stageHistory.map((entry) => (
              <li key={entry.at}>
                {formatDate(entry.at)}: {entry.from ? STAGE_LABELS[entry.from as OpportunityStageValue] : "New"} to{" "}
                {entry.to ? STAGE_LABELS[entry.to as OpportunityStageValue] : "unknown"}
                {entry.note ? ` (${entry.note})` : ""}
              </li>
            ))}
          </ol>
        ) : null}
      </Section>

      <Section eyebrow="9" title="Important risks">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-3">Evidence of risk</h3>
            <EvidenceList items={content.risks.evidence} citations={citations} empty="No risk-related evidence is stored." />
          </div>
          <div>
            <h3 className="eyebrow mb-3">Generated flags</h3>
            <GeneratedList items={content.risks.generated} empty="No rule-based flags were triggered." />
          </div>
        </div>
      </Section>

      <Section eyebrow="10" title="Counterarguments">
        <GeneratedList items={content.counterarguments} empty="No counterarguments were generated from the evidence shape." />
      </Section>

      <Section eyebrow="11" title="Unverified information and AI inference">
        <div className="grid gap-8 lg:grid-cols-2">
          <EvidenceList items={content.unverified} citations={citations} empty="No unverified statements." />
          <EvidenceList items={content.inferences} citations={citations} empty="No AI inferences." />
        </div>
      </Section>

      <Section eyebrow="12" title="Missing information">
        <MissingList items={content.missingInformation} />
      </Section>

      <Section eyebrow="13" title="Outstanding diligence questions">
        <GeneratedList items={content.diligenceQuestions} empty="No questions were generated." />
      </Section>

      <Section eyebrow="14" title="Score breakdown">
        {score.status === "SCORED" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <caption className="mb-3 text-left text-xs text-muted-foreground">
                Overall {score.overall}/100, confidence {score.confidence}, {score.modelOrProvider}, calculated {formatDate(score.calculatedAt)}. Heuristic, not a
                judgment.
              </caption>
              <thead className="border-b border-border font-mono text-[0.66rem] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th scope="col" className="py-2 pr-3">Criterion</th>
                  <th scope="col" className="py-2 pr-3">Score</th>
                  <th scope="col" className="py-2">Weight</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {score.criteria.map((criterion) => (
                  <tr key={criterion.key}>
                    <th scope="row" className="py-2 pr-3 font-normal">{enumLabel(criterion.key.replace(/([A-Z])/g, "_$1"))}</th>
                    <td className="py-2 pr-3 font-mono">{criterion.score ?? "Unavailable"}</td>
                    <td className="py-2 font-mono">{criterion.weight ?? "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {score.missingInfo.length ? <p className="mt-3 text-xs text-[hsl(39_32%_70%)]">Missing: {score.missingInfo.join(" ")}</p> : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{score.explanation}</p>
        )}
      </Section>

      <Section eyebrow="Appendix" title="Sources">
        <SourceAppendix sources={content.sourceAppendix} />
      </Section>
    </>
  );
}
