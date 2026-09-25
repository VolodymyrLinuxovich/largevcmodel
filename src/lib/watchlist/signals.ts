/**
 * Pure derivation of watchlist signals from records LargeVCModel already stores. Nothing here
 * reaches the network: a signal exists only because a sync, research run or user action wrote a
 * record after the watch item was last checked.
 */

export type WatchSignalTypeValue =
  | "NEW_RESEARCH_CLAIM"
  | "NEW_SOURCE"
  | "NEW_EMAIL"
  | "NEW_MEETING"
  | "RELATIONSHIP_HEALTH_CHANGED"
  | "OPPORTUNITY_STAGE_CHANGED"
  | "FIT_SCORE_CHANGED";

export type WatchTarget = {
  id: string;
  entityType: "COMPANY" | "CONTACT" | "OPPORTUNITY";
  companyId: string | null;
  contactId: string | null;
  opportunityId: string | null;
  /** For OPPORTUNITY items: the opportunity's company, whose research and scores are also watched. */
  opportunityCompanyId?: string | null;
  since: Date;
};

export type SignalRecords = {
  claims: Array<{ id: string; companyId: string | null; contactId: string | null; text: string; provenance: string; sourceCount: number; createdAt: Date }>;
  sources: Array<{ id: string; companyId: string | null; contactId: string | null; title: string; origin: string; publisher: string | null; createdAt: Date }>;
  interactions: Array<{ id: string; contactId: string; type: string; occurredAt: Date; createdAt: Date }>;
  healthSnapshots: Array<{
    id: string;
    contactId: string;
    state: string;
    score: number | null;
    previousState: string | null;
    previousScore: number | null;
    algorithmVersion: string;
    calculatedAt: Date;
  }>;
  stageEvents: Array<{ id: string; opportunityId: string; companyId: string; companyName: string; fromStage: string | null; toStage: string | null; actor: string; createdAt: Date }>;
  /** Fit scores ordered oldest to newest per company, including the score before the window for deltas. */
  fitScores: Array<{ id: string; companyId: string; overall: number; confidence: number; modelOrProvider: string; calculatedAt: Date }>;
};

export type SignalCandidate = {
  watchlistItemId: string;
  type: WatchSignalTypeValue;
  title: string;
  detail: string | null;
  provenance: string;
  sourceRecordType: string;
  sourceRecordId: string;
  occurredAt: Date;
  dedupeKey: string;
  metadata: Record<string, string | number | null>;
};

export const HEALTH_SCORE_SIGNAL_DELTA = 10;
export const FIT_SCORE_SIGNAL_DELTA = 5;

const STATE_RANK: Record<string, number> = { DORMANT: 0, COOLING: 1, STABLE: 2, STRENGTHENING: 3 };

export function dedupeKey(itemId: string, type: WatchSignalTypeValue, recordId: string) {
  return `${itemId}:${type}:${recordId}`;
}

function truncate(text: string, max = 180) {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function label(value: string | null) {
  return value ? value.toLowerCase().replaceAll("_", " ") : "unknown";
}

/**
 * Health changes are significant when the state changes or the score moves by at least
 * HEALTH_SCORE_SIGNAL_DELTA. The first calculation (no previous value) is a baseline, not a change.
 */
export function classifyHealthChange(snapshot: SignalRecords["healthSnapshots"][number]): "IMPROVED" | "DETERIORATED" | "CHANGED" | null {
  if (snapshot.previousState === null) return null;
  const stateChanged = snapshot.previousState !== snapshot.state;
  const delta = snapshot.score !== null && snapshot.previousScore !== null ? snapshot.score - snapshot.previousScore : null;
  if (!stateChanged && (delta === null || Math.abs(delta) < HEALTH_SCORE_SIGNAL_DELTA)) return null;
  const before = STATE_RANK[snapshot.previousState];
  const after = STATE_RANK[snapshot.state];
  if (stateChanged && before !== undefined && after !== undefined) return after > before ? "IMPROVED" : after < before ? "DETERIORATED" : "CHANGED";
  if (delta !== null && delta !== 0) return delta > 0 ? "IMPROVED" : "DETERIORATED";
  return "CHANGED";
}

export function deriveSignals(targets: WatchTarget[], records: SignalRecords): SignalCandidate[] {
  const signals: SignalCandidate[] = [];
  const push = (target: WatchTarget, candidate: Omit<SignalCandidate, "watchlistItemId" | "dedupeKey">) =>
    signals.push({ ...candidate, watchlistItemId: target.id, dedupeKey: dedupeKey(target.id, candidate.type, candidate.sourceRecordId) });

  for (const target of targets) {
    const companyId = target.companyId ?? target.opportunityCompanyId ?? null;
    const isNew = (createdAt: Date) => createdAt > target.since;
    const concerns = (record: { companyId: string | null; contactId: string | null }) =>
      (companyId !== null && record.companyId === companyId) || (target.contactId !== null && record.contactId === target.contactId);

    for (const claim of records.claims) {
      if (!concerns(claim) || !isNew(claim.createdAt)) continue;
      push(target, {
        type: "NEW_RESEARCH_CLAIM",
        title: "New research claim",
        detail: truncate(claim.text),
        provenance: `Research claim (${label(claim.provenance)}, ${claim.sourceCount} ${claim.sourceCount === 1 ? "source" : "sources"})`,
        sourceRecordType: "ResearchClaim",
        sourceRecordId: claim.id,
        occurredAt: claim.createdAt,
        metadata: { provenance: claim.provenance, sourceCount: claim.sourceCount },
      });
    }

    for (const source of records.sources) {
      if (!concerns(source) || !isNew(source.createdAt)) continue;
      push(target, {
        type: "NEW_SOURCE",
        title: "New source discovered",
        detail: truncate(source.title),
        provenance: `Source stored from ${source.origin}${source.publisher ? ` (${source.publisher})` : ""}`,
        sourceRecordType: "Source",
        sourceRecordId: source.id,
        occurredAt: source.createdAt,
        metadata: { origin: source.origin },
      });
    }

    if (target.contactId) {
      for (const interaction of records.interactions) {
        if (interaction.contactId !== target.contactId || !isNew(interaction.createdAt)) continue;
        const email = interaction.type === "EMAIL_SENT" || interaction.type === "EMAIL_RECEIVED";
        if (!email && interaction.type !== "CALENDAR_MEETING") continue;
        push(target, {
          type: email ? "NEW_EMAIL" : "NEW_MEETING",
          title: email ? (interaction.type === "EMAIL_SENT" ? "Email sent" : "Email received") : "Calendar meeting",
          detail: null,
          provenance: email ? "Gmail sync" : "Google Calendar sync",
          sourceRecordType: "ContactInteraction",
          sourceRecordId: interaction.id,
          occurredAt: interaction.occurredAt,
          metadata: { interactionType: interaction.type },
        });
      }

      for (const snapshot of records.healthSnapshots) {
        if (snapshot.contactId !== target.contactId || !isNew(snapshot.calculatedAt)) continue;
        const change = classifyHealthChange(snapshot);
        if (!change) continue;
        push(target, {
          type: "RELATIONSHIP_HEALTH_CHANGED",
          title: change === "IMPROVED" ? "Relationship health improved" : change === "DETERIORATED" ? "Relationship health deteriorated" : "Relationship health changed",
          detail: `${label(snapshot.previousState)} (${snapshot.previousScore ?? "n/a"}) to ${label(snapshot.state)} (${snapshot.score ?? "n/a"})`,
          provenance: `Relationship health engine (${snapshot.algorithmVersion})`,
          sourceRecordType: "RelationshipHealthSnapshot",
          sourceRecordId: snapshot.id,
          occurredAt: snapshot.calculatedAt,
          metadata: { direction: change, previousScore: snapshot.previousScore, score: snapshot.score },
        });
      }
    }

    for (const event of records.stageEvents) {
      const matches = target.opportunityId ? event.opportunityId === target.opportunityId : companyId !== null && event.companyId === companyId;
      if (!matches || !isNew(event.createdAt)) continue;
      push(target, {
        type: "OPPORTUNITY_STAGE_CHANGED",
        title: `${event.companyName} moved to ${label(event.toStage)}`,
        detail: `From ${label(event.fromStage)}`,
        provenance: `Pipeline change by ${event.actor}`,
        sourceRecordType: "OpportunityEvent",
        sourceRecordId: event.id,
        occurredAt: event.createdAt,
        metadata: { fromStage: event.fromStage, toStage: event.toStage },
      });
    }

    if (companyId) {
      const scores = records.fitScores.filter((score) => score.companyId === companyId).sort((a, b) => a.calculatedAt.getTime() - b.calculatedAt.getTime());
      scores.forEach((score, index) => {
        const previous = scores[index - 1];
        if (!previous || !isNew(score.calculatedAt)) return;
        const delta = score.overall - previous.overall;
        if (Math.abs(delta) < FIT_SCORE_SIGNAL_DELTA) return;
        push(target, {
          type: "FIT_SCORE_CHANGED",
          title: `Fit score ${delta > 0 ? "rose" : "fell"} from ${previous.overall} to ${score.overall}`,
          detail: `Confidence ${score.confidence}`,
          provenance: score.modelOrProvider,
          sourceRecordType: "FitScore",
          sourceRecordId: score.id,
          occurredAt: score.calculatedAt,
          metadata: { previous: previous.overall, current: score.overall, delta },
        });
      });
    }
  }

  const unique = new Map(signals.map((signal) => [signal.dedupeKey, signal]));
  return Array.from(unique.values()).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime());
}
