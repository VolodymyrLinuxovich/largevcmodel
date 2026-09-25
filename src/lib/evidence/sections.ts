import { claimToEvidence, isEstablished, resolveKeyFacts, toSourceRef, type SensitiveFactKey } from "./classify";
import type { EvidenceBundle } from "./loader";
import { safeExternalUrl } from "./safe-url";
import type { EvidenceItem, GeneratedItem, KeyFact, SourceRef } from "./types";

const DAY_MS = 86_400_000;
const STALE_RESEARCH_DAYS = 180;

export function iso(date: Date | null | undefined) {
  return date ? date.toISOString() : null;
}

/** Company fields entered in LargeVCModel are user-provided facts, never public research. */
export function companyFieldItems(bundle: EvidenceBundle): EvidenceItem[] {
  const company = bundle.company;
  const fields: Array<[string, string | null]> = [
    ["Description", company.description],
    ["Sector", company.sector],
    ["Company stage", company.stage],
    ["Geography", company.geography],
    ["Business model", company.businessModel],
    ["Website", company.website],
    ["Domain", company.domain],
  ];
  return fields
    .filter((entry): entry is [string, string] => Boolean(entry[1]))
    .map(([label, value]) => ({
      id: `company:${company.id}:${label}`,
      text: `${label}: ${value}`,
      category: "company",
      evidenceClass: "USER_PROVIDED",
      confidence: null,
      sourceIds: [],
      record: { type: "company", id: company.id },
      observedAt: iso(company.updatedAt),
    }));
}

export function claimItems(bundle: EvidenceBundle) {
  return bundle.claims.map(claimToEvidence);
}

export function partitionClaims(items: EvidenceItem[]) {
  return {
    established: items.filter(isEstablished),
    unverified: items.filter((item) => item.evidenceClass === "UNVERIFIED"),
    inferences: items.filter((item) => item.evidenceClass === "AI_INFERENCE"),
  };
}

const GENERIC_CATEGORIES = /^(|other|general|misc|miscellaneous|research|unknown|uncategorized)$/i;

/**
 * Selects items by their stored category. Claim text is consulted only for uncategorized claims,
 * so a keyword in one claim's wording cannot move it into an unrelated section.
 */
export function byCategory(items: EvidenceItem[], pattern: RegExp) {
  return items.filter((item) => {
    const category = (item.category ?? "").trim();
    return GENERIC_CATEGORIES.test(category) ? pattern.test(item.text) : pattern.test(category);
  });
}

/** Sources cited by the given items, deduplicated, in first-citation order so numbering is stable. */
export function citedSources(bundle: EvidenceBundle, items: EvidenceItem[]): SourceRef[] {
  const all = new Map(bundle.claims.flatMap((claim) => claim.sources).map((source) => [source.id, source]));
  const ordered = new Map<string, SourceRef>();
  for (const item of items) {
    for (const sourceId of item.sourceIds) {
      const source = all.get(sourceId);
      if (source && !ordered.has(sourceId)) ordered.set(sourceId, toSourceRef(source));
    }
  }
  return Array.from(ordered.values());
}

export function emailItems(bundle: EvidenceBundle): EvidenceItem[] {
  return bundle.emails.map((thread) => ({
    id: `gmail:${thread.id}`,
    text: `${thread.subject?.trim() || "(no subject)"} (${thread.messageCount} ${thread.messageCount === 1 ? "message" : "messages"}${thread.hasUserReply ? ", you replied" : ""})`,
    category: "email",
    evidenceClass: "CONNECTED_ACCOUNT",
    confidence: null,
    sourceIds: [],
    record: { type: "gmail_thread", id: thread.id, href: safeExternalUrl(thread.threadUrl) },
    observedAt: iso(thread.lastMessageAt),
  }));
}

export function meetingItems(bundle: EvidenceBundle, when: "past" | "upcoming"): EvidenceItem[] {
  return bundle.meetings
    .filter((meeting) => (when === "past" ? meeting.startsAt <= bundle.now : meeting.startsAt > bundle.now))
    .sort((a, b) => (when === "past" ? b.startsAt.getTime() - a.startsAt.getTime() : a.startsAt.getTime() - b.startsAt.getTime()))
    .map((meeting) => ({
      id: `calendar:${meeting.id}`,
      text: `${meeting.title?.trim() || "Untitled meeting"} (${meeting.attendees.length} attendees)`,
      category: "meeting",
      evidenceClass: "CONNECTED_ACCOUNT",
      confidence: null,
      sourceIds: [],
      record: { type: "calendar_event", id: meeting.id, href: safeExternalUrl(meeting.htmlLink) },
      observedAt: iso(meeting.startsAt),
    }));
}

export type PersonSummary = {
  contactId: string;
  name: string;
  role: string;
  title: string | null;
  organization: string | null;
  healthState: string;
  healthScore: number | null;
  lastInteractionAt: string | null;
  healthExplanation: string[];
};

export function personSummaries(bundle: EvidenceBundle): PersonSummary[] {
  return bundle.people.map((person) => ({
    contactId: person.contactId,
    name: person.name,
    role: person.role,
    title: person.title,
    organization: person.organization,
    healthState: person.health.state,
    healthScore: person.health.score,
    lastInteractionAt: iso(person.health.lastInteractionAt),
    healthExplanation: person.health.explanation,
  }));
}

export type WarmIntroduction = {
  contactId: string;
  name: string;
  basis: "RECORDED_INTRODUCER" | "INTRODUCER_ROLE";
  relationshipEvidence: EvidenceItem[];
  healthState: string | null;
};

/** Warm paths come only from introducers the user recorded, backed by stored relationship edges. */
export function warmIntroductions(bundle: EvidenceBundle): WarmIntroduction[] {
  const intros = new Map<string, WarmIntroduction>();
  const edgeItems = (contactId: string): EvidenceItem[] =>
    bundle.edges
      .filter((edge) => edge.toNodeId === contactId)
      .map((edge) => ({
        id: `edge:${edge.id}`,
        text: `${edge.relationship} via ${edge.source} (strength ${edge.strength}/10): ${edge.evidence}`,
        category: "relationship",
        evidenceClass: "CONNECTED_ACCOUNT",
        confidence: null,
        sourceIds: [],
        record: { type: "relationship_edge", id: edge.id },
        observedAt: null,
      }));
  if (bundle.introducer) {
    const person = bundle.people.find((item) => item.contactId === bundle.introducer!.contactId);
    intros.set(bundle.introducer.contactId, {
      contactId: bundle.introducer.contactId,
      name: bundle.introducer.name,
      basis: "RECORDED_INTRODUCER",
      relationshipEvidence: edgeItems(bundle.introducer.contactId),
      healthState: person?.health.state ?? null,
    });
  }
  for (const person of bundle.people.filter((item) => item.role === "INTRODUCER")) {
    if (intros.has(person.contactId)) continue;
    intros.set(person.contactId, {
      contactId: person.contactId,
      name: person.name,
      basis: "INTRODUCER_ROLE",
      relationshipEvidence: edgeItems(person.contactId),
      healthState: person.health.state,
    });
  }
  return Array.from(intros.values());
}

export type ThesisCompatibility =
  | { status: "NO_THESIS"; explanation: string }
  | { status: "NOT_SCORED"; thesisName: string; explanation: string }
  | {
      status: "SCORED";
      thesisName: string | null;
      overall: number;
      confidence: number;
      criteria: Array<{ key: string; score: number; weight: number | null }>;
      missingInfo: string[];
      explanation: string;
      modelOrProvider: string;
      calculatedAt: string;
    };

export function thesisCompatibility(bundle: EvidenceBundle): ThesisCompatibility {
  if (!bundle.fitScore) {
    return bundle.thesis
      ? { status: "NOT_SCORED", thesisName: bundle.thesis.name, explanation: "The opportunity has not been scored against this thesis." }
      : { status: "NO_THESIS", explanation: "No investment thesis is saved, so thesis compatibility cannot be assessed." };
  }
  const fit = bundle.fitScore;
  return {
    status: "SCORED",
    thesisName: bundle.thesis?.name ?? null,
    overall: fit.overall,
    confidence: fit.confidence,
    criteria: Object.entries(fit.criteria).map(([key, score]) => ({ key, score, weight: fit.weights[key] ?? null })),
    missingInfo: fit.missingInfo,
    explanation: fit.explanation,
    modelOrProvider: fit.modelOrProvider,
    calculatedAt: fit.calculatedAt.toISOString(),
  };
}

const QUESTION_FOR_FACT: Record<SensitiveFactKey, string> = {
  revenue: "What is current revenue or ARR, and how is it recognized?",
  funding: "How much has the company raised to date, from whom, and on what terms?",
  valuation: "What valuation or terms are being discussed for this round?",
  employees: "How large is the team today and how is it split across functions?",
  traction: "Which usage, growth or retention metrics best show traction, and over what period?",
  investors: "Which investors are currently on the cap table or committed to this round?",
  customers: "Who are the paying customers today, and can any be referenced?",
};

export function keyFacts(items: EvidenceItem[]): KeyFact[] {
  return resolveKeyFacts(items);
}

/** Missing information is reported explicitly; it is never scored or filled in. */
export function missingInformation(bundle: EvidenceBundle, facts: KeyFact[]): string[] {
  const missing: string[] = [];
  for (const fact of facts) {
    if (fact.status === "UNAVAILABLE") missing.push(`${fact.label}: not established by any stored evidence.`);
    if (fact.status === "UNVERIFIED") missing.push(`${fact.label}: only unverified or AI-inferred statements exist.`);
  }
  if (!bundle.company.description) missing.push("Company description has not been provided.");
  if (!bundle.people.length) missing.push("No people are linked to this opportunity.");
  if (!bundle.claims.length) missing.push("No research claims are stored for this company or its linked people.");
  if (!bundle.coverage.gmailConnected) missing.push("Gmail is not connected; email history may be incomplete.");
  if (!bundle.coverage.calendarConnected) missing.push("Google Calendar is not connected; meeting history may be incomplete.");
  if (bundle.fitScore) missing.push(...bundle.fitScore.missingInfo.map((item) => `Fit score: ${item}`));
  return Array.from(new Set(missing));
}

/** Deterministic flags; each states the evidence (or gap) that triggered it. */
export function concerns(bundle: EvidenceBundle, items: EvidenceItem[]): GeneratedItem[] {
  const flags: GeneratedItem[] = [];
  const assessed = bundle.people.filter((person) => person.health.state !== "INSUFFICIENT_DATA");
  if (assessed.length && assessed.every((person) => person.health.state === "COOLING" || person.health.state === "DORMANT")) {
    flags.push({
      kind: "GENERATED_SUGGESTION",
      text: "Every assessed relationship on this opportunity is cooling or dormant.",
      basis: assessed.map((person) => `${person.name}: ${person.health.state.toLowerCase()}`).join("; "),
    });
  }
  if (bundle.fitScore) {
    for (const [key, score] of Object.entries(bundle.fitScore.criteria)) {
      if (["thesisMatch", "stageFit", "geographyFit"].includes(key) && score > 0 && score < 50) {
        flags.push({ kind: "GENERATED_SUGGESTION", text: `Low ${key.replace(/([A-Z])/g, " $1").toLowerCase()} in the stored fit score.`, basis: `Criterion score ${score}/100.` });
      }
    }
  }
  const unverified = items.filter((item) => item.evidenceClass === "UNVERIFIED" || item.evidenceClass === "AI_INFERENCE");
  if (unverified.length) {
    flags.push({
      kind: "GENERATED_SUGGESTION",
      text: `${unverified.length} stored ${unverified.length === 1 ? "statement is" : "statements are"} unverified or AI-inferred and should not be relied on without confirmation.`,
      basis: "Claims without cited sources or marked as inference.",
    });
  }
  const riskClaims = byCategory(items.filter(isEstablished), /\b(risk|concern|litigation|regulat|churn|competition|competitor)\b/i);
  for (const claim of riskClaims.slice(0, 5)) {
    flags.push({ kind: "GENERATED_SUGGESTION", text: `Evidence mentions a potential risk: ${claim.text}`, basis: `Claim ${claim.record.id}.` });
  }
  const accessed = bundle.claims.flatMap((claim) => claim.sources.map((source) => source.accessedAt.getTime()));
  if (accessed.length) {
    const newestDays = (bundle.now.getTime() - Math.max(...accessed)) / DAY_MS;
    if (newestDays > STALE_RESEARCH_DAYS) {
      flags.push({
        kind: "GENERATED_SUGGESTION",
        text: "Stored research may be stale.",
        basis: `The most recently accessed source is ${Math.floor(newestDays)} days old.`,
      });
    }
  }
  return flags;
}

export function suggestedQuestions(bundle: EvidenceBundle, facts: KeyFact[], items: EvidenceItem[], limit = 10): GeneratedItem[] {
  const questions: GeneratedItem[] = [];
  for (const fact of facts) {
    if (fact.status !== "ESTABLISHED") {
      questions.push({
        kind: "GENERATED_SUGGESTION",
        text: QUESTION_FOR_FACT[fact.key as SensitiveFactKey],
        basis: `${fact.label} is ${fact.status === "UNAVAILABLE" ? "not available" : "not verified"} in stored evidence.`,
      });
    }
  }
  for (const item of items.filter((entry) => entry.evidenceClass === "UNVERIFIED").slice(0, 3)) {
    questions.push({ kind: "GENERATED_SUGGESTION", text: `Can you confirm: "${item.text}"?`, basis: `Unverified claim ${item.record.id}.` });
  }
  if (bundle.thesis && bundle.fitScore) {
    const weak = Object.entries(bundle.fitScore.criteria).filter(([key, score]) => ["stageFit", "geographyFit"].includes(key) && score < 50);
    for (const [key] of weak) {
      const target = key === "stageFit" ? bundle.thesis.stages.join(", ") : bundle.thesis.geographies.join(", ");
      if (target) {
        questions.push({
          kind: "GENERATED_SUGGESTION",
          text: `How does the company relate to the thesis ${key === "stageFit" ? "stage" : "geography"} focus (${target})?`,
          basis: `Low ${key} criterion in the stored fit score.`,
        });
      }
    }
  }
  return questions.slice(0, limit);
}
