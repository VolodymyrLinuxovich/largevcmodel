import Link from "next/link";
import { citationMapFor, EvidenceList, GeneratedList, MissingList, SourceAppendix } from "@/components/evidence/evidence-list";
import { KeyFactsTable } from "@/components/evidence/key-facts";
import { enumLabel } from "@/components/pipeline/labels";
import { HealthStateBadge } from "@/components/relationships/health-state-badge";
import { Section } from "@/components/workspace/core";
import type { MeetingBriefContent } from "@/lib/briefs/assemble";
import type { RelationshipHealthState } from "@/lib/domain/relationship-health";
import { formatDate, formatTime } from "@/lib/utils";

export function MeetingBriefView({ content }: { content: MeetingBriefContent }) {
  const citations = citationMapFor(content.sources);
  const { facts } = content;
  const thesis = facts.thesis;
  return (
    <>
      <Section eyebrow="Part 1 / Evidence" title="Company overview">
        {content.subject.meeting ? (
          <p className="mb-5 text-sm text-muted-foreground">
            Prepared for {content.subject.meeting.title ?? "a meeting"} on {formatTime(content.subject.meeting.startsAt)} with{" "}
            {content.subject.meeting.attendees.length} attendees.
          </p>
        ) : null}
        <EvidenceList items={facts.companyOverview} citations={citations} empty="No company overview has been provided or sourced." />
      </Section>

      <Section eyebrow="Evidence" title="Key facts">
        <p className="mb-4 text-sm text-muted-foreground">
          Revenue, funding, valuation, headcount, traction, investors and customers are shown only when stored evidence supports them.
        </p>
        <KeyFactsTable facts={facts.keyFacts} citations={citations} />
      </Section>

      <Section eyebrow="Evidence" title="People and relationship history">
        {facts.people.length ? (
          <ul className="mb-8 divide-y divide-border border-y border-border">
            {facts.people.map((person) => (
              <li key={person.contactId} className="grid gap-2 py-3 md:grid-cols-[1fr_auto]">
                <div>
                  <Link href={`/contacts/${person.contactId}`} className="text-sm font-semibold underline-offset-4 hover:underline">
                    {person.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {enumLabel(person.role)}
                    {[person.title, person.organization].filter(Boolean).length ? ` / ${[person.title, person.organization].filter(Boolean).join(", ")}` : ""}
                    {person.lastInteractionAt ? ` / last interaction ${formatDate(person.lastInteractionAt)}` : ""}
                  </p>
                </div>
                <HealthStateBadge state={person.healthState as RelationshipHealthState} score={person.healthScore} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-8 text-sm text-muted-foreground">No people are linked to this opportunity.</p>
        )}
        <div className="grid gap-8 lg:grid-cols-3">
          <div>
            <h3 className="eyebrow mb-3">Recent email threads</h3>
            <EvidenceList items={facts.relationshipHistory.emails} citations={citations} empty="No Gmail threads with linked people." />
          </div>
          <div>
            <h3 className="eyebrow mb-3">Past meetings</h3>
            <EvidenceList items={facts.relationshipHistory.pastMeetings} citations={citations} empty="No past calendar meetings with linked people." />
          </div>
          <div>
            <h3 className="eyebrow mb-3">Upcoming meetings</h3>
            <EvidenceList items={facts.relationshipHistory.upcomingMeetings} citations={citations} empty="No upcoming meetings found." />
          </div>
        </div>
      </Section>

      <Section eyebrow="Evidence" title="Warm introductions">
        {facts.warmIntroductions.length ? (
          <ul className="space-y-6">
            {facts.warmIntroductions.map((intro) => (
              <li key={intro.contactId}>
                <p className="text-sm font-semibold">
                  {intro.name}{" "}
                  <span className="font-normal text-muted-foreground">
                    ({intro.basis === "RECORDED_INTRODUCER" ? "recorded as introducer" : "linked with introducer role"})
                  </span>
                </p>
                <div className="mt-2">
                  <EvidenceList items={intro.relationshipEvidence} citations={citations} empty="No stored relationship edge supports this path." />
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No introduction path is recorded. LargeVCModel does not infer introductions.</p>
        )}
      </Section>

      <Section eyebrow="Evidence" title="Thesis compatibility">
        {thesis.status === "SCORED" ? (
          <div>
            <p className="text-sm">
              <span className="font-mono text-3xl">{thesis.overall}</span> / 100, confidence {thesis.confidence}
              {thesis.thesisName ? ` against "${thesis.thesisName}"` : ""} ({thesis.modelOrProvider}, {formatDate(thesis.calculatedAt)})
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
              {thesis.criteria.map((criterion) => (
                <li key={criterion.key} className="border border-border px-2 py-1.5">
                  {enumLabel(criterion.key.replace(/([A-Z])/g, "_$1"))}: <span className="font-mono">{criterion.score}</span>
                  {criterion.weight !== null ? <span className="text-muted-foreground"> (weight {criterion.weight})</span> : null}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">{thesis.explanation} Scores are prioritization heuristics, not investment judgments.</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{thesis.explanation}</p>
        )}
      </Section>

      <Section eyebrow="Evidence" title="Research claims">
        <EvidenceList items={facts.research} citations={citations} empty="No verified research claims are stored. Run research with a configured provider to add sourced claims." />
      </Section>

      <Section eyebrow="Not verified" title="Unverified statements and AI inferences">
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-3">Unverified</h3>
            <EvidenceList items={content.unverified} citations={citations} empty="None." />
          </div>
          <div>
            <h3 className="eyebrow mb-3">AI inference</h3>
            <EvidenceList items={content.inferences} citations={citations} empty="None." />
          </div>
        </div>
      </Section>

      <Section eyebrow="Gaps" title="Missing information">
        <MissingList items={content.missingInformation} />
      </Section>

      <Section eyebrow="Part 2 / Generated" title="Potential concerns and questions to ask">
        <p className="mb-5 text-sm text-muted-foreground">
          These are rule-based prompts generated by LargeVCModel from the evidence above and its gaps. They are not facts.
        </p>
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            <h3 className="eyebrow mb-3">Potential concerns</h3>
            <GeneratedList items={content.generated.concerns} empty="No rule-based concerns were triggered." />
          </div>
          <div>
            <h3 className="eyebrow mb-3">Questions worth asking</h3>
            <GeneratedList items={content.generated.questions} empty="No questions were generated." />
          </div>
        </div>
      </Section>

      <Section eyebrow="Appendix" title="Sources">
        <SourceAppendix sources={content.sources} />
      </Section>
    </>
  );
}
