import type { EvidenceBundle } from "@/lib/evidence/loader";
import {
  byCategory,
  citedSources,
  claimItems,
  companyFieldItems,
  concerns,
  iso,
  keyFacts,
  missingInformation,
  partitionClaims,
  personSummaries,
  suggestedQuestions,
  thesisCompatibility,
  warmIntroductions,
  type PersonSummary,
  type ThesisCompatibility,
  type WarmIntroduction,
} from "@/lib/evidence/sections";
import { EVIDENCE_CLASS_LABELS, type EvidenceClass, type EvidenceItem, type GeneratedItem, type KeyFact, type SourceRef } from "@/lib/evidence/types";
import { phraseMatch } from "@/lib/domain/text-match";
import { STAGE_LABELS } from "@/lib/pipeline/stages";

export const IC_MEMO_VERSION = "ic-memo-v1";

export const MEMO_NOTICE =
  "This memo organizes evidence stored in LargeVCModel for human investment judgment. It contains no investment recommendation, and generated items are prompts, not findings.";

export type InvestmentMemoContent = {
  version: typeof IC_MEMO_VERSION;
  generatedAt: string;
  notice: string;
  subject: { opportunityId: string; companyName: string; stage: string; title: string | null };
  /** Computed statements about the evidence set itself (counts, coverage), not claims about the company. */
  executiveSummary: string[];
  evidenceMix: Array<{ evidenceClass: EvidenceClass; label: string; count: number }>;
  company: EvidenceItem[];
  thesisAlignment: ThesisAlignment;
  market: EvidenceItem[];
  product: EvidenceItem[];
  team: { people: PersonSummary[]; evidence: EvidenceItem[] };
  traction: KeyFact[];
  relationshipContext: {
    people: PersonSummary[];
    warmIntroductions: WarmIntroduction[];
    stageHistory: Array<{ from: string | null; to: string | null; note: string | null; at: string }>;
  };
  risks: { evidence: EvidenceItem[]; generated: GeneratedItem[] };
  counterarguments: GeneratedItem[];
  unverified: EvidenceItem[];
  inferences: EvidenceItem[];
  missingInformation: string[];
  diligenceQuestions: GeneratedItem[];
  scoreBreakdown: ThesisCompatibility;
  sourceAppendix: SourceRef[];
  counts: { claims: number; sources: number; people: number };
};

const MARKET = /\b(market|problem|industry|tam|sam|demand|customer pain|segment)\b/i;
const PRODUCT = /\b(product|technology|technical|platform|ip|patent|architecture|model|software|hardware)\b/i;
const TEAM = /\b(team|founder|co-founder|ceo|cto|hire|hiring|employees|headcount|leadership|background)\b/i;
const RISK = /\b(risk|concern|litigation|regulat\w*|churn|competition|competitor|dependency|lawsuit)\b/i;
const TRACTION_KEYS = new Set(["traction", "revenue", "customers"]);

export type AlignmentMatch = "MATCH" | "NO_MATCH" | "UNKNOWN" | "NOT_DEFINED";

export type ThesisAlignment =
  | { status: "NO_THESIS"; explanation: string }
  | {
      status: "COMPARED";
      thesisName: string;
      rows: Array<{ criterion: string; companyValue: string | null; thesisValues: string[]; match: AlignmentMatch }>;
      explanation: string;
    };

/** Compares user-provided company fields with thesis targets; unknown values are never counted as mismatches. */
export function compareWithThesis(bundle: EvidenceBundle): ThesisAlignment {
  if (!bundle.thesis) return { status: "NO_THESIS", explanation: "No investment thesis is saved." };
  const compare = (value: string | null, targets: string[]): AlignmentMatch => {
    if (!targets.length) return "NOT_DEFINED";
    if (!value) return "UNKNOWN";
    return targets.some((target) => phraseMatch(value, target)) ? "MATCH" : "NO_MATCH";
  };
  const { company, thesis } = bundle;
  return {
    status: "COMPARED",
    thesisName: thesis.name,
    rows: [
      { criterion: "Sector", companyValue: company.sector, thesisValues: thesis.targetSectors, match: compare(company.sector, thesis.targetSectors) },
      { criterion: "Stage", companyValue: company.stage, thesisValues: thesis.stages, match: compare(company.stage, thesis.stages) },
      { criterion: "Geography", companyValue: company.geography, thesisValues: thesis.geographies, match: compare(company.geography, thesis.geographies) },
    ],
    explanation: "Whole-word comparison of user-provided company fields with thesis targets. Unknown company fields are reported as unknown, not as mismatches.",
  };
}

function generated(text: string, basis: string): GeneratedItem {
  return { kind: "GENERATED_SUGGESTION", text, basis };
}

function counterarguments(bundle: EvidenceBundle, established: EvidenceItem[], facts: KeyFact[], sources: SourceRef[]): GeneratedItem[] {
  const items: GeneratedItem[] = [];
  const market = byCategory(established, MARKET);
  const marketSources = new Set(market.flatMap((item) => item.sourceIds));
  if (market.length && marketSources.size <= 1) {
    items.push(generated("Market evidence rests on at most one cited source; the market thesis may be under-evidenced.", `${market.length} market claims citing ${marketSources.size} source(s).`));
  }
  const publishers = new Set(sources.map((source) => source.publisher ?? source.url ?? source.id));
  if (sources.length >= 2 && publishers.size === 1) {
    items.push(generated("All public evidence comes from a single publisher; independent corroboration is missing.", `${sources.length} sources, 1 publisher.`));
  }
  const traction = facts.filter((fact) => TRACTION_KEYS.has(fact.key));
  if (traction.every((fact) => fact.status !== "ESTABLISHED")) {
    items.push(generated("No traction, revenue or customer evidence is established; any case for the company currently rests on descriptive information.", "Traction, revenue and customer facts are unverified or unavailable."));
  }
  if (bundle.fitScore && bundle.fitScore.overall >= 60 && bundle.fitScore.confidence < 50) {
    items.push(
      generated(
        "The fit score is relatively high but its confidence is low; the alignment may not hold once gaps are filled.",
        `Fit ${bundle.fitScore.overall} with confidence ${bundle.fitScore.confidence}.`,
      ),
    );
  }
  if (bundle.thesis?.exclusionCriteria) {
    items.push(generated(`Check the opportunity against the thesis exclusion criteria: ${bundle.thesis.exclusionCriteria}`, `Thesis "${bundle.thesis.name}" defines exclusions.`));
  }
  const teamPeople = bundle.people.filter((person) => person.role === "FOUNDER" || person.role === "EXECUTIVE");
  if (!teamPeople.length) {
    items.push(generated("No founders or executives are linked, so team assessment has no relationship or identity grounding.", "No FOUNDER or EXECUTIVE contacts linked."));
  }
  return items;
}

export function assembleInvestmentMemo(bundle: EvidenceBundle): InvestmentMemoContent {
  const claims = claimItems(bundle);
  const { established, unverified, inferences } = partitionClaims(claims);
  const facts = keyFacts(claims);
  const companyItems = [...companyFieldItems(bundle), ...byCategory(established, /\b(overview|company|description|business)\b/i)];
  const market = byCategory(established, MARKET);
  const product = byCategory(established, PRODUCT);
  const teamEvidence = byCategory(established, TEAM);
  const riskEvidence = byCategory(established, RISK);
  const sources = citedSources(bundle, [...companyItems, ...established, ...unverified, ...inferences]);
  const people = personSummaries(bundle);
  const thesis = thesisCompatibility(bundle);
  const missing = missingInformation(bundle, facts);

  const mix = (Object.keys(EVIDENCE_CLASS_LABELS) as EvidenceClass[]).map((evidenceClass) => ({
    evidenceClass,
    label: EVIDENCE_CLASS_LABELS[evidenceClass],
    count: [...companyItems.filter((item) => item.record.type === "company"), ...claims].filter((item) => item.evidenceClass === evidenceClass).length,
  }));
  const supported = facts.filter((fact) => fact.status === "ESTABLISHED").map((fact) => fact.label.toLowerCase());
  const unsupported = facts.filter((fact) => fact.status !== "ESTABLISHED").map((fact) => fact.label.toLowerCase());

  const executiveSummary = [
    `${bundle.company.name} is in ${STAGE_LABELS[bundle.opportunity.stage]} (since ${iso(bundle.opportunity.stageChangedAt)?.slice(0, 10)}).`,
    `Stored evidence: ${established.length} established ${established.length === 1 ? "item" : "items"}, ${unverified.length} unverified, ${inferences.length} AI ${inferences.length === 1 ? "inference" : "inferences"}, ${sources.length} cited ${sources.length === 1 ? "source" : "sources"}.`,
    supported.length
      ? `Key facts with attributable evidence (see the cited claims): ${supported.join(", ")}.`
      : "No sensitive key fact (revenue, funding, valuation, headcount, traction, investors, customers) is addressed by attributable evidence.",
    ...(unsupported.length && supported.length ? [`Not established: ${unsupported.join(", ")}.`] : []),
    thesis.status === "SCORED"
      ? `Heuristic fit score ${thesis.overall}/100 (confidence ${thesis.confidence})${thesis.thesisName ? ` against "${thesis.thesisName}"` : ""}.`
      : thesis.explanation,
    `${people.length} linked ${people.length === 1 ? "person" : "people"}; ${missing.length} missing-information ${missing.length === 1 ? "item" : "items"} recorded.`,
  ];

  return {
    version: IC_MEMO_VERSION,
    generatedAt: bundle.now.toISOString(),
    notice: MEMO_NOTICE,
    subject: { opportunityId: bundle.opportunity.id, companyName: bundle.company.name, stage: bundle.opportunity.stage, title: bundle.opportunity.title },
    executiveSummary,
    evidenceMix: mix,
    company: companyItems,
    thesisAlignment: compareWithThesis(bundle),
    market,
    product,
    team: { people: people.filter((person) => person.role === "FOUNDER" || person.role === "EXECUTIVE"), evidence: teamEvidence },
    traction: facts.filter((fact) => TRACTION_KEYS.has(fact.key)),
    relationshipContext: {
      people,
      warmIntroductions: warmIntroductions(bundle),
      stageHistory: bundle.stageEvents.map((event) => ({ from: event.fromStage, to: event.toStage, note: event.note, at: event.createdAt.toISOString() })),
    },
    risks: { evidence: riskEvidence, generated: concerns(bundle, claims) },
    counterarguments: counterarguments(bundle, established, facts, sources),
    unverified,
    inferences,
    missingInformation: missing,
    diligenceQuestions: suggestedQuestions(bundle, facts, claims, 15),
    scoreBreakdown: thesis,
    sourceAppendix: sources,
    counts: { claims: claims.length, sources: sources.length, people: people.length },
  };
}
