import { ContactSource, IntegrationService, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

export const entityTypeSchema = z.enum(["person", "company", "organization", "conversation", "meeting", "mixed"]);
export const strictnessSchema = z.enum(["strict", "balanced", "exploratory"]);

export const networkSearchRequestSchema = z.object({
  query: z.string().min(2).max(1000),
  stage: z.string().max(120).optional(),
  sector: z.string().max(160).optional(),
  geography: z.string().max(160).optional(),
  dateRange: z.string().max(120).optional(),
  entityType: entityTypeSchema.optional(),
  relationshipFilter: z.string().max(160).optional(),
  relationshipStrength: z.coerce.number().min(0).max(10).optional(),
  strictness: strictnessSchema.default("balanced"),
});

export type ResultEntityType = "PERSON" | "COMPANY" | "ORGANIZATION" | "CONVERSATION" | "MEETING";
export type EntityClassification = "PERSON" | "COMPANY" | "ORGANIZATION" | "CONVERSATION" | "MEETING" | "AUTOMATED_SENDER" | "MAILING_LIST" | "UNKNOWN";
export type MatchState = "matched" | "missing" | "contradicted" | "unavailable";

export type ParsedNetworkQuery = {
  rawQuery: string;
  entityTypes: ResultEntityType[];
  roles: string[];
  topics: string[];
  geographies: string[];
  institutions: string[];
  companies: string[];
  fundingStages: string[];
  dateRange?: { preset: string; start?: string; end?: string };
  relationshipRequirements: string[];
  interactionTypes: Array<"email" | "meeting" | "contact">;
  followUpState?: "no_follow_up" | "needs_follow_up";
  introductionPathRequired: boolean;
  sourceRestrictions: string[];
  positiveKeywords: string[];
  negativeKeywords: string[];
  sortingPreference: "relevance" | "recency" | "relationship";
  strictness: z.infer<typeof strictnessSchema>;
  requestedAutomatedContent: boolean;
  unavailableVerification: string[];
  sources: Array<"Google Contacts" | "Gmail" | "Google Calendar" | "Research" | "Profile">;
};

export type SearchEvidence = {
  criterion: string;
  state: MatchState;
  label: string;
  value?: string | null;
  source: "Google Contacts" | "Gmail" | "Google Calendar" | "Research" | "Profile" | "User";
  sourceRecordId?: string | null;
};

export type NetworkCandidate = {
  id: string;
  entityType: ResultEntityType;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  sourceTypes: Array<SearchEvidence["source"]>;
  text: string;
  occurredAt?: Date | string | null;
  relationshipStrength?: number | null;
  interactionCount?: number | null;
  hasUserReply?: boolean | null;
  classification: EntityClassification;
  classificationConfidence: number;
  classificationSignals: string[];
  evidence: SearchEvidence[];
  metadata?: Record<string, unknown>;
};

export type NetworkSearchResult = {
  id: string;
  entityType: ResultEntityType;
  title: string;
  subtitle?: string | null;
  href?: string | null;
  score: number;
  confidence: number;
  classification: EntityClassification;
  classificationConfidence: number;
  classificationSignals: string[];
  whyMatched: string;
  evidence: SearchEvidence[];
  missingCriteria: SearchEvidence[];
  contradictedCriteria: SearchEvidence[];
  unavailableCriteria: SearchEvidence[];
  sourceTypes: Array<SearchEvidence["source"]>;
  lastInteractionAt?: string | null;
  metadata?: Record<string, unknown>;
};

const ROLE_SYNONYMS: Record<string, string[]> = {
  founder: ["founder", "co-founder", "cofounder", "founding"],
  investor: ["investor", "vc", "venture", "partner", "principal", "associate"],
  professor: ["professor", "faculty", "lecturer", "academic"],
  recruiter: ["recruiter", "recruiting", "talent", "sourcer"],
  researcher: ["researcher", "scientist", "research"],
  operator: ["operator", "operations", "chief of staff"],
  advisor: ["advisor", "adviser"],
  engineer: ["engineer", "software", "developer", "technical"],
};

const ENTITY_HINTS: Array<[ResultEntityType, RegExp]> = [
  ["CONVERSATION", /\b(conversation|conversations|thread|threads|email|emails|inbox|message|messages|newsletter|newsletters|receipt|receipts|alert|alerts|notification|notifications|marketing)\b/i],
  ["MEETING", /\b(meeting|meetings|met|calendar|event|events|attended)\b/i],
  ["COMPANY", /\b(company|companies|startup|startups|business|domain|domains|associated with|mentioned in my inbox)\b/i],
  ["ORGANIZATION", /\b(organization|organizations|university|school|lab|firm|agency|institution)\b/i],
  ["PERSON", /\b(person|people|contact|contacts|founder|founders|professor|professors|investor|investors|recruiter|recruiters|operator|operators|advisor|advisors|researcher|researchers|someone|everyone|introduce|intro)\b/i],
];

const STOPWORDS = new Set([
  "find",
  "show",
  "search",
  "who",
  "that",
  "with",
  "from",
  "about",
  "into",
  "someone",
  "people",
  "person",
  "contacts",
  "contact",
  "company",
  "companies",
  "conversation",
  "conversations",
  "meeting",
  "meetings",
  "working",
  "work",
  "spoke",
  "emailed",
  "last",
  "recent",
  "recently",
  "this",
  "that",
  "have",
  "could",
  "would",
  "should",
  "never",
  "not",
  "followed",
  "follow",
  "later",
  "everyone",
  "associated",
  "specific",
  "mentioned",
  "inbox",
  "calendar",
  "roles",
  "roles",
  "and",
  "the",
  "for",
  "you",
  "who",
  "what",
  "where",
  "when",
  "why",
  "how",
  "six",
  "months",
  "year",
  "semester",
]);

const COMMON_GEOS = [
  "ukraine",
  "europe",
  "bay area",
  "san francisco",
  "berkeley",
  "california",
  "new york",
  "london",
  "paris",
  "berlin",
  "austin",
  "seattle",
  "boston",
  "united states",
  "us",
  "usa",
];

const AUTOMATED_LOCAL_PATTERNS = [
  /^no-?reply$/,
  /^do-?not-?reply$/,
  /^notifications?$/,
  /^mailer-daemon$/,
  /^postmaster$/,
  /newsletter/,
  /digest/,
  /updates?/,
  /alerts?/,
  /marketing/,
  /promo/,
  /billing/,
  /receipt/,
  /invoice/,
  /support/,
];

function unique(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function lower(value?: string | null) {
  return value?.toLowerCase() ?? "";
}

function tokenize(value: string) {
  return lower(value)
    .split(/[^a-z0-9@.+-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 1);
}

function normalizedText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").toLowerCase();
}

function containsAny(text: string, needles: string[]) {
  return needles.some((needle) => tokenVariants(needle).some((variant) => text.includes(variant)));
}

function tokenVariants(value: string) {
  const normalized = value.toLowerCase();
  const variants = new Set([normalized]);
  if (normalized.endsWith("ies")) variants.add(`${normalized.slice(0, -3)}y`);
  if (normalized.endsWith("es")) variants.add(normalized.slice(0, -2));
  if (normalized.endsWith("s")) variants.add(normalized.slice(0, -1));
  return Array.from(variants).filter(Boolean);
}

function extractAfterPhrases(query: string, phrases: string[]) {
  const values: string[] = [];
  for (const phrase of phrases) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`\\b${escaped}\\s+([a-z0-9][a-z0-9 .&+-]{1,80})`, "i");
    const match = query.match(regex);
    if (match?.[1]) {
      const cleaned = match[1]
        .split(/\b(who|that|with|and|or|about|last|this|where|when|working|raised|met|emailed|never|not)\b/i)[0]
        .replace(/[?.!,]+$/g, "")
        .trim();
      if (cleaned) values.push(cleaned);
    }
  }
  return values;
}

function parseDateRange(query: string, manual?: string, now = new Date()) {
  const value = (manual || query).toLowerCase();
  const year = now.getUTCFullYear();
  if (value.includes("last year")) {
    return { preset: "last year", start: `${year - 1}-01-01T00:00:00.000Z`, end: `${year - 1}-12-31T23:59:59.999Z` };
  }
  if (value.includes("last semester")) {
    const month = now.getUTCMonth();
    if (month < 6) return { preset: "last semester", start: `${year - 1}-08-01T00:00:00.000Z`, end: `${year - 1}-12-31T23:59:59.999Z` };
    return { preset: "last semester", start: `${year}-01-01T00:00:00.000Z`, end: `${year}-05-31T23:59:59.999Z` };
  }
  const months = value.match(/\b(?:last|past|previous|in)\s+(\d+|six|three|twelve)\s+months?\b/);
  if (months) {
    const count = months[1] === "six" ? 6 : months[1] === "three" ? 3 : months[1] === "twelve" ? 12 : Number(months[1]);
    return { preset: `${count} months`, start: new Date(now.getTime() - count * 30 * 86_400_000).toISOString(), end: now.toISOString() };
  }
  if (value.includes("recent") || value.includes("recently")) {
    return { preset: "recent", start: new Date(now.getTime() - 90 * 86_400_000).toISOString(), end: now.toISOString() };
  }
  return undefined;
}

function roleHints(query: string) {
  const text = lower(query);
  return Object.entries(ROLE_SYNONYMS)
    .filter(([, terms]) => containsAny(text, terms))
    .map(([role]) => role);
}

function entityTypesFor(query: string, requested?: z.infer<typeof entityTypeSchema>): ResultEntityType[] {
  if (requested && requested !== "mixed") return [requested.toUpperCase() as ResultEntityType];
  if (requested === "mixed") return ["PERSON", "COMPANY", "ORGANIZATION", "CONVERSATION", "MEETING"];
  const matched = ENTITY_HINTS.filter(([, regex]) => regex.test(query)).map(([type]) => type);
  if (matched.length) return unique(matched) as ResultEntityType[];
  return ["PERSON", "COMPANY", "ORGANIZATION", "CONVERSATION", "MEETING"];
}

function normalizeManualTopicAndGeo(input: { sector?: string; geography?: string }) {
  const sector = input.sector?.trim();
  const geography = input.geography?.trim();
  if (sector && !geography && COMMON_GEOS.includes(sector.toLowerCase())) {
    return { topics: [], geographies: [sector] };
  }
  return { topics: sector ? [sector] : [], geographies: geography ? [geography] : [] };
}

export function parseNetworkObjective(input: z.infer<typeof networkSearchRequestSchema>, now = new Date()): ParsedNetworkQuery {
  const query = input.query.trim();
  const text = lower(query);
  const manual = normalizeManualTopicAndGeo(input);
  const entityTypes = entityTypesFor(query, input.entityType);
  const roles = roleHints(query);
  const fundingStages = unique([
    input.stage,
    text.includes("pre-seed") || text.includes("pre seed") ? "pre-seed" : null,
    text.includes("seed") ? "seed" : null,
    text.includes("series a") ? "series A" : null,
  ]);
  const geographies = unique([
    ...manual.geographies,
    ...COMMON_GEOS.filter((geo) => text.includes(geo)),
    ...extractAfterPhrases(text, ["in", "near"]).filter((value) => value.length <= 40),
  ]);
  const institutions = unique([
    text.includes("berkeley") ? "Berkeley" : null,
    ...extractAfterPhrases(text, ["at university of", "at"]).filter((value) => /university|college|school|berkeley|stanford|mit/i.test(value)),
  ]);
  const companies = unique([
    ...extractAfterPhrases(text, ["at", "from", "associated with", "mentioning", "mentioned", "about"]).filter(
      (value) => !COMMON_GEOS.includes(value) && !ROLE_SYNONYMS.founder.includes(value),
    ),
  ]);
  const dateRange = parseDateRange(query, input.dateRange, now);
  const introductionPathRequired = /\b(intro|introduce|introduction|warm path|warm intro)\b/i.test(query);
  const followUpState = /\b(never followed up|no follow up|not followed up|without follow)\b/i.test(query) ? "no_follow_up" : undefined;
  const interactionTypes = unique([
    /\b(email|emailed|inbox|conversation|thread)\b/i.test(query) ? "email" : null,
    /\b(meet|met|meeting|calendar|event)\b/i.test(query) ? "meeting" : null,
    /\b(contact|contacts|google contacts)\b/i.test(query) ? "contact" : null,
  ]) as ParsedNetworkQuery["interactionTypes"];
  const requestedAutomatedContent = /\b(newsletter|newsletters|receipt|receipts|alert|alerts|notification|notifications|marketing|promo|account activity|transactional)\b/i.test(query);
  const sortingPreference = /\b(recent|recently|last|latest)\b/i.test(query)
    ? "recency"
    : /\b(strongest|closest|warm|relationship)\b/i.test(query)
      ? "relationship"
      : "relevance";
  const recognized = new Set([
    ...roles,
    ...fundingStages.map((item) => item.toLowerCase()),
    ...geographies.flatMap(tokenize),
    ...institutions.flatMap(tokenize),
    ...companies.flatMap(tokenize),
  ]);
  const positiveKeywords = unique([
    ...manual.topics.flatMap(tokenize),
    ...tokenize(query).filter((term) => !STOPWORDS.has(term) && !recognized.has(term) && !/^\d+$/.test(term)),
  ]).slice(0, 14);
  const topics = unique([
    ...manual.topics,
    ...positiveKeywords.filter((term) => !roles.includes(term) && !companies.flatMap(tokenize).includes(term)).slice(0, 6),
  ]);
  const negativeKeywords = extractAfterPhrases(text, ["not", "without", "excluding"]).flatMap(tokenize);
  const unavailableVerification = fundingStages.length
    ? ["Funding stage requires a connected public research provider unless already present in saved research claims."]
    : [];
  const sources: ParsedNetworkQuery["sources"] = [];
  if (entityTypes.some((type) => ["PERSON", "COMPANY", "ORGANIZATION"].includes(type))) sources.push("Google Contacts");
  if (entityTypes.some((type) => ["PERSON", "CONVERSATION", "COMPANY", "ORGANIZATION"].includes(type)) || interactionTypes.includes("email")) sources.push("Gmail");
  if (entityTypes.includes("MEETING") || interactionTypes.includes("meeting")) sources.push("Google Calendar");
  if (fundingStages.length) sources.push("Research");
  sources.push("Profile");

  return {
    rawQuery: query,
    entityTypes,
    roles,
    topics,
    geographies,
    institutions,
    companies,
    fundingStages,
    dateRange,
    relationshipRequirements: unique([
      introductionPathRequired ? "introduction path" : null,
      input.relationshipFilter,
      /\b(spoke|emailed|met|communicated)\b/i.test(query) ? "prior interaction" : null,
    ]),
    interactionTypes,
    followUpState,
    introductionPathRequired,
    sourceRestrictions: [],
    positiveKeywords,
    negativeKeywords,
    sortingPreference,
    strictness: input.strictness,
    requestedAutomatedContent,
    unavailableVerification,
    sources: unique(sources) as ParsedNetworkQuery["sources"],
  };
}

function emailAutomationSignals(email?: string | null) {
  if (!email) return ["No email address"];
  const [local = ""] = email.toLowerCase().split("@");
  return AUTOMATED_LOCAL_PATTERNS.filter((pattern) => pattern.test(local)).map((pattern) =>
    pattern instanceof RegExp ? "Transactional or bulk sender naming pattern" : "Automated local-part pattern",
  );
}

function headerSignals(headers?: Record<string, unknown> | null) {
  const signals: string[] = [];
  const value = (name: string) => String(headers?.[name] ?? headers?.[name.toLowerCase()] ?? "");
  if (value("List-Unsubscribe")) signals.push("List-Unsubscribe header");
  if (value("List-Id")) signals.push("List-Id header");
  if (/bulk|list|junk/i.test(value("Precedence"))) signals.push("Bulk precedence header");
  if (/auto-|generated|reply/i.test(value("Auto-Submitted"))) signals.push("Auto-Submitted header");
  return signals;
}

export function classifyRecord(input: {
  entityType: ResultEntityType;
  title?: string | null;
  email?: string | null;
  organization?: string | null;
  role?: string | null;
  source?: ContactSource | string | null;
  messageDirections?: string[];
  headers?: Array<Record<string, unknown> | null | undefined>;
  labels?: string[];
  attendeeCount?: number;
}): { classification: EntityClassification; confidence: number; signals: string[] } {
  if (input.entityType === "MEETING") {
    return { classification: "MEETING", confidence: 92, signals: ["Calendar event record"] };
  }
  if (input.entityType === "CONVERSATION") {
    const signals = unique([...(input.headers ?? []).flatMap((headers) => headerSignals(headers)), ...(input.labels ?? []).filter((label) => /category_promotions|category_updates/i.test(label)).map((label) => `Gmail label ${label}`)]);
    const hasReciprocal = new Set(input.messageDirections ?? []).size > 1;
    if (signals.length && !hasReciprocal) return { classification: "MAILING_LIST", confidence: Math.min(98, 78 + signals.length * 5), signals: [...signals, "No reciprocal conversation"] };
    return { classification: "CONVERSATION", confidence: hasReciprocal ? 88 : 70, signals: hasReciprocal ? ["Reciprocal Gmail conversation"] : ["Gmail thread metadata"] };
  }
  if (input.entityType === "COMPANY" || input.entityType === "ORGANIZATION") {
    return { classification: input.entityType, confidence: input.organization || input.title ? 84 : 70, signals: ["Organization-level record"] };
  }

  const textName = input.title?.trim() || "";
  const nameLooksLikeEmail = textName.includes("@");
  const automation = unique([...(input.headers ?? []).flatMap((headers) => headerSignals(headers)), ...emailAutomationSignals(input.email)]);
  const hasReciprocal = new Set(input.messageDirections ?? []).size > 1;
  const personSignals = unique([
    input.source === ContactSource.GOOGLE_CONTACTS ? "Structured Google Contact" : null,
    input.role ? "Job title present" : null,
    input.organization ? "Organization field present" : null,
    textName && !nameLooksLikeEmail ? "Person-like display name" : null,
    hasReciprocal ? "Reciprocal email conversation" : null,
  ]);

  if (automation.length >= 2 && !hasReciprocal && personSignals.length <= 1) {
    return { classification: "AUTOMATED_SENDER", confidence: Math.min(98, 78 + automation.length * 5), signals: unique([...automation, "No reciprocal conversation"]) };
  }
  if (personSignals.length) {
    return { classification: "PERSON", confidence: Math.min(96, 58 + personSignals.length * 9), signals: personSignals };
  }
  if (automation.length) {
    return { classification: "AUTOMATED_SENDER", confidence: 72, signals: automation };
  }
  return { classification: "UNKNOWN", confidence: 45, signals: ["Insufficient identity evidence"] };
}

function matchEvidence(criterion: string, label: string, value: string | null | undefined, source: SearchEvidence["source"], sourceRecordId?: string | null): SearchEvidence {
  return { criterion, state: "matched", label, value: value ?? null, source, sourceRecordId };
}

function missingEvidence(criterion: string, label: string, source: SearchEvidence["source"] = "User"): SearchEvidence {
  return { criterion, state: "missing", label, source };
}

function unavailableEvidence(criterion: string, label: string, source: SearchEvidence["source"] = "Research"): SearchEvidence {
  return { criterion, state: "unavailable", label, source };
}

function contradictionEvidence(criterion: string, label: string, value: string | null | undefined, source: SearchEvidence["source"]): SearchEvidence {
  return { criterion, state: "contradicted", label, value: value ?? null, source };
}

function candidateText(candidate: NetworkCandidate) {
  return lower([candidate.title, candidate.subtitle, candidate.text, candidate.evidence.map((item) => item.value).join(" ")].join(" "));
}

function criterionScore(parsed: ParsedNetworkQuery, candidate: NetworkCandidate) {
  const text = candidateText(candidate);
  const evidence = [...candidate.evidence];
  const missing: SearchEvidence[] = [];
  const contradicted: SearchEvidence[] = [];
  const unavailable: SearchEvidence[] = [];
  let structured = 0;
  let possible = 0;

  const criteria: Array<{ name: string; values: string[]; weight: number; source?: SearchEvidence["source"] }> = [
    { name: "Role", values: parsed.roles.flatMap((role) => ROLE_SYNONYMS[role] ?? [role]), weight: 16, source: "Google Contacts" },
    { name: "Topic", values: parsed.topics, weight: 18, source: "Gmail" },
    { name: "Geography", values: parsed.geographies, weight: 14, source: "Google Contacts" },
    { name: "Institution", values: parsed.institutions, weight: 10, source: "Google Contacts" },
    { name: "Company", values: parsed.companies, weight: 14, source: "Google Contacts" },
    { name: "Funding stage", values: parsed.fundingStages, weight: 12, source: "Research" },
  ];

  for (const criterion of criteria) {
    if (!criterion.values.length) continue;
    possible += criterion.weight;
    if (criterion.name === "Funding stage" && !containsAny(text, criterion.values)) {
      unavailable.push(unavailableEvidence(criterion.name, `${criterion.name} requires public research or saved sourced claims`, "Research"));
      continue;
    }
    if (containsAny(text, criterion.values)) {
      structured += criterion.weight;
      evidence.push(matchEvidence(criterion.name, criterion.values.join(" or "), criterion.values.find((value) => containsAny(text, [value])) ?? criterion.values[0], criterion.source ?? "User", candidate.id));
    } else {
      missing.push(missingEvidence(criterion.name, `${criterion.name}: ${criterion.values.join(" or ")}`, criterion.source ?? "User"));
    }
  }

  if (parsed.dateRange) {
    possible += 10;
    const occurred = candidate.occurredAt ? new Date(candidate.occurredAt).getTime() : null;
    const start = parsed.dateRange.start ? new Date(parsed.dateRange.start).getTime() : null;
    const end = parsed.dateRange.end ? new Date(parsed.dateRange.end).getTime() : null;
    if (occurred && (!start || occurred >= start) && (!end || occurred <= end)) {
      structured += 10;
      evidence.push(matchEvidence("Date range", parsed.dateRange.preset, new Date(occurred).toISOString(), candidate.entityType === "MEETING" ? "Google Calendar" : "Gmail", candidate.id));
    } else {
      missing.push(missingEvidence("Date range", parsed.dateRange.preset, candidate.entityType === "MEETING" ? "Google Calendar" : "Gmail"));
    }
  }

  if (parsed.followUpState === "no_follow_up") {
    possible += 12;
    if (candidate.entityType === "PERSON" && candidate.interactionCount && !candidate.hasUserReply) {
      structured += 12;
      evidence.push(matchEvidence("Follow-up state", "No stored user reply after imported interaction", "No follow-up detected in synced metadata", "Gmail", candidate.id));
    } else {
      missing.push(missingEvidence("Follow-up state", "No-follow-up condition not supported by synced evidence", "Gmail"));
    }
  }

  if (parsed.introductionPathRequired) {
    possible += 12;
    const relationshipPathCount = Number(candidate.metadata?.relationshipPathCount ?? 0);
    if (relationshipPathCount > 0) {
      structured += 12;
      evidence.push(matchEvidence("Introduction path", "Relationship edge exists", `${relationshipPathCount} relationship edges`, "Google Contacts", candidate.id));
    } else {
      missing.push(missingEvidence("Introduction path", "No supported introduction path found", "Google Contacts"));
    }
  }

  for (const keyword of parsed.negativeKeywords) {
    if (keyword && text.includes(keyword)) {
      contradicted.push(contradictionEvidence("Negative keyword", `Excluded keyword present: ${keyword}`, keyword, "User"));
    }
  }

  return { structured, possible, evidence, missing, contradicted, unavailable };
}

function entityTypeMatch(parsed: ParsedNetworkQuery, candidate: NetworkCandidate) {
  return parsed.entityTypes.includes(candidate.entityType) ? 24 : 0;
}

function semanticScore(parsed: ParsedNetworkQuery, candidate: NetworkCandidate) {
  const text = candidateText(candidate);
  if (!parsed.positiveKeywords.length) return 0;
  const matched = parsed.positiveKeywords.filter((keyword) => containsAny(text, [keyword]));
  return Math.min(22, Math.round((matched.length / parsed.positiveKeywords.length) * 22));
}

function relationshipScore(candidate: NetworkCandidate) {
  const strength = Math.max(0, Math.min(10, candidate.relationshipStrength ?? 0));
  const interactions = Math.min(5, candidate.interactionCount ?? 0);
  return Math.round(strength * 0.8 + interactions * 0.4);
}

function sourceConfidence(candidate: NetworkCandidate) {
  return Math.min(12, candidate.sourceTypes.length * 4 + Math.round(candidate.classificationConfidence / 25));
}

function isEligible(parsed: ParsedNetworkQuery, candidate: NetworkCandidate, score: number, criterion: ReturnType<typeof criterionScore>) {
  const threshold = parsed.strictness === "strict" ? 68 : parsed.strictness === "exploratory" ? 24 : 38;
  const automated = candidate.classification === "AUTOMATED_SENDER" || candidate.classification === "MAILING_LIST";
  if (automated && candidate.entityType === "PERSON" && parsed.entityTypes.includes("PERSON") && !parsed.requestedAutomatedContent) {
    return false;
  }
  if (candidate.classification === "UNKNOWN" && parsed.strictness !== "exploratory") return false;
  if (parsed.strictness === "strict" && criterion.missing.length + criterion.unavailable.length > 1) return false;
  return score >= threshold;
}

export function rankNetworkCandidates(parsed: ParsedNetworkQuery, candidates: NetworkCandidate[]) {
  const results = candidates
    .map((candidate) => {
      const criterion = criterionScore(parsed, candidate);
      const typeScore = entityTypeMatch(parsed, candidate);
      const semantic = semanticScore(parsed, candidate);
      const structured = criterion.possible ? Math.round((criterion.structured / criterion.possible) * 24) : 0;
      const relationship = relationshipScore(candidate);
      const source = sourceConfidence(candidate);
      const contradictionPenalty = criterion.contradicted.length * 18;
      const unsupportedPenalty = criterion.unavailable.length * (parsed.strictness === "strict" ? 12 : 5);
      const lowQualityPenalty = candidate.classification === "AUTOMATED_SENDER" || candidate.classification === "MAILING_LIST" ? (parsed.requestedAutomatedContent ? 0 : 24) : 0;
      const rawScore = typeScore + semantic + structured + relationship + source - contradictionPenalty - unsupportedPenalty - lowQualityPenalty;
      const score = Math.max(0, Math.min(100, rawScore));
      const eligible = isEligible(parsed, candidate, score, criterion);
      const matchedLabels = criterion.evidence
        .filter((item) => item.state === "matched")
        .slice(0, 3)
        .map((item) => item.criterion.toLowerCase());
      return {
        ...candidate,
        score,
        confidence: Math.max(0, Math.min(100, Math.round((score + candidate.classificationConfidence) / 2))),
        whyMatched: matchedLabels.length
          ? `Matched ${matchedLabels.join(", ")} using ${candidate.sourceTypes.join(", ")} evidence.`
          : `Matched by entity type and connected ${candidate.sourceTypes.join(", ")} evidence.`,
        evidence: criterion.evidence,
        missingCriteria: criterion.missing,
        contradictedCriteria: criterion.contradicted,
        unavailableCriteria: criterion.unavailable,
        eligible,
        lastInteractionAt: candidate.occurredAt ? new Date(candidate.occurredAt).toISOString() : null,
      };
    })
    .filter((result) => result.eligible)
    .sort((a, b) => {
      if (parsed.sortingPreference === "recency") return (new Date(b.occurredAt ?? 0).getTime() || 0) - (new Date(a.occurredAt ?? 0).getTime() || 0) || b.score - a.score;
      if (parsed.sortingPreference === "relationship") return (b.relationshipStrength ?? 0) - (a.relationshipStrength ?? 0) || b.score - a.score;
      return b.score - a.score;
    })
    .slice(0, 30);

  return results.map(({ eligible: _eligible, text: _text, occurredAt: _occurredAt, relationshipStrength: _relationshipStrength, interactionCount: _interactionCount, hasUserReply: _hasUserReply, ...result }) => result satisfies NetworkSearchResult);
}

export function dedupeNetworkCandidates(candidates: NetworkCandidate[]) {
  const byStableKey = new Map<string, NetworkCandidate>();
  for (const candidate of candidates) {
    const email = typeof candidate.metadata?.primaryEmail === "string" ? candidate.metadata.primaryEmail.toLowerCase() : "";
    const companyId = typeof candidate.metadata?.companyId === "string" ? candidate.metadata.companyId : "";
    const key =
      candidate.entityType === "PERSON" && email
        ? `person-email:${email}`
        : candidate.entityType === "COMPANY" && companyId
          ? `company:${companyId}`
          : candidate.id;
    const existing = byStableKey.get(key);
    if (!existing || (candidate.sourceTypes.length > existing.sourceTypes.length || (candidate.relationshipStrength ?? 0) > (existing.relationshipStrength ?? 0))) {
      byStableKey.set(key, candidate);
    }
  }
  return Array.from(byStableKey.values());
}

type ContactRecord = Prisma.ContactGetPayload<{
  include: {
    company: true;
    interactions: true;
    gmailThreads: { include: { messages: true } };
    calendarEvents: true;
    claims: true;
  };
}>;

type CompanyRecord = Prisma.CompanyGetPayload<{ include: { contacts: true; claims: true } }>;
type ThreadRecord = Prisma.GmailThreadGetPayload<{ include: { contact: true; messages: true } }>;
type CalendarRecord = Prisma.CalendarEventGetPayload<{ include: { contact: true } }>;
type RelationshipRecord = { fromNodeId: string; toNodeId: string };

function jsonObject(value: Prisma.JsonValue | null | undefined) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function contactCandidate(contact: ContactRecord, relationships: RelationshipRecord[]): NetworkCandidate {
  const messages = contact.gmailThreads.flatMap((thread) => thread.messages);
  const classification = classifyRecord({
    entityType: "PERSON",
    title: contact.fullName,
    email: contact.primaryEmail,
    organization: contact.organization,
    role: contact.title,
    source: contact.source,
    messageDirections: messages.map((message) => message.direction),
    headers: messages.map((message) => jsonObject(message.headers)),
  });
  const relationshipPathCount = relationships.filter((edge) => edge.fromNodeId === contact.id || edge.toNodeId === contact.id).length;
  const text = normalizedText([
    contact.fullName,
    contact.primaryEmail,
    contact.organization,
    contact.title,
    contact.notes,
    contact.tags.join(" "),
    contact.groups.join(" "),
    contact.company?.name,
    contact.company?.description,
    contact.company?.sector,
    contact.company?.stage,
    contact.company?.geography,
    contact.gmailThreads.map((thread) => `${thread.subject ?? ""} ${thread.snippet ?? ""}`).join(" "),
    contact.calendarEvents.map((event) => `${event.title ?? ""} ${event.description ?? ""} ${event.location ?? ""}`).join(" "),
    contact.claims.map((claim) => claim.text).join(" "),
  ]);
  return {
    id: `contact:${contact.id}`,
    entityType: "PERSON",
    title: contact.fullName ?? contact.primaryEmail ?? "Unnamed contact",
    subtitle: [contact.title, contact.organization ?? contact.company?.name].filter(Boolean).join(" / ") || null,
    href: `/contacts/${contact.id}`,
    sourceTypes: unique([contact.source === ContactSource.GOOGLE_CONTACTS ? "Google Contacts" : "Gmail", contact.calendarEvents.length ? "Google Calendar" : null, contact.claims.length ? "Research" : null]) as NetworkCandidate["sourceTypes"],
    text,
    occurredAt: contact.lastInteractionAt,
    relationshipStrength: contact.relationshipStrength,
    interactionCount: contact.interactionCount,
    hasUserReply: contact.gmailThreads.some((thread) => thread.hasUserReply),
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    classificationSignals: classification.signals,
    evidence: unique([
      contact.title ? "Job title" : null,
      contact.organization ? "Organization" : null,
      contact.lastInteractionAt ? "Last interaction" : null,
      contact.interactionCount ? "Interaction count" : null,
    ]).map((label) =>
      matchEvidence(label, label, label === "Job title" ? contact.title : label === "Organization" ? contact.organization : label === "Last interaction" ? contact.lastInteractionAt?.toISOString() : String(contact.interactionCount), contact.source === ContactSource.GOOGLE_CONTACTS ? "Google Contacts" : "Gmail", contact.id),
    ),
    metadata: { contactId: contact.id, companyId: contact.companyId, primaryEmail: contact.primaryEmail, relationshipPathCount },
  };
}

function companyCandidate(company: CompanyRecord): NetworkCandidate {
  const text = normalizedText([
    company.name,
    company.domain,
    company.website,
    company.description,
    company.sector,
    company.stage,
    company.geography,
    company.contacts.map((contact) => `${contact.fullName ?? ""} ${contact.title ?? ""} ${contact.organization ?? ""}`).join(" "),
    company.claims.map((claim) => claim.text).join(" "),
  ]);
  const classification = classifyRecord({ entityType: "COMPANY", title: company.name, organization: company.name });
  return {
    id: `company:${company.id}`,
    entityType: "COMPANY",
    title: company.name,
    subtitle: [company.domain, company.sector, company.stage].filter(Boolean).join(" / ") || null,
    href: `/contacts?source=&q=${encodeURIComponent(company.name)}`,
    sourceTypes: unique(["Google Contacts", company.claims.length ? "Research" : null]) as NetworkCandidate["sourceTypes"],
    text,
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    classificationSignals: classification.signals,
    evidence: unique([
      company.domain ? "Domain" : null,
      company.sector ? "Sector" : null,
      company.stage ? "Stage" : null,
      company.geography ? "Geography" : null,
    ]).map((label) =>
      matchEvidence(label, label, label === "Domain" ? company.domain : label === "Sector" ? company.sector : label === "Stage" ? company.stage : company.geography, "Google Contacts", company.id),
    ),
    metadata: { companyId: company.id, contactCount: company.contacts.length },
  };
}

function organizationCandidates(contacts: ContactRecord[]): NetworkCandidate[] {
  const byName = new Map<string, ContactRecord[]>();
  for (const contact of contacts) {
    if (!contact.organization) continue;
    const key = contact.organization.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(contact);
  }
  return Array.from(byName.entries()).map(([key, records]) => {
    const name = records[0].organization ?? key;
    const text = normalizedText(records.map((contact) => `${contact.fullName ?? ""} ${contact.title ?? ""} ${contact.organization ?? ""} ${contact.notes ?? ""}`));
    const classification = classifyRecord({ entityType: "ORGANIZATION", title: name, organization: name });
    return {
      id: `organization:${key}`,
      entityType: "ORGANIZATION" as const,
      title: name,
      subtitle: `${records.length} connected contact${records.length === 1 ? "" : "s"}`,
      href: `/contacts?q=${encodeURIComponent(name)}`,
      sourceTypes: ["Google Contacts"] as NetworkCandidate["sourceTypes"],
      text,
      occurredAt: records.map((record) => record.lastInteractionAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0],
      relationshipStrength: Math.max(...records.map((record) => record.relationshipStrength ?? 0)),
      interactionCount: records.reduce((sum, record) => sum + record.interactionCount, 0),
      classification: classification.classification,
      classificationConfidence: classification.confidence,
      classificationSignals: classification.signals,
      evidence: [matchEvidence("Organization", "Organization field", name, "Google Contacts", records[0].id)],
      metadata: { contactIds: records.map((record) => record.id) },
    };
  });
}

function threadCandidate(thread: ThreadRecord): NetworkCandidate {
  const headers = thread.messages.map((message) => jsonObject(message.headers));
  const classification = classifyRecord({
    entityType: "CONVERSATION",
    title: thread.subject,
    email: thread.messages[0]?.fromEmail,
    messageDirections: thread.messages.map((message) => message.direction),
    headers,
    labels: thread.labels,
  });
  const text = normalizedText([
    thread.subject,
    thread.snippet,
    thread.participantEmails.join(" "),
    thread.labels.join(" "),
    thread.messages.map((message) => `${message.subject ?? ""} ${message.snippet ?? ""} ${message.fromEmail ?? ""} ${message.toEmails.join(" ")}`).join(" "),
    thread.contact?.fullName,
    thread.contact?.organization,
    thread.contact?.title,
  ]);
  return {
    id: `thread:${thread.id}`,
    entityType: "CONVERSATION",
    title: thread.subject ?? "Gmail conversation",
    subtitle: thread.participantEmails.slice(0, 4).join(", ") || thread.contact?.primaryEmail,
    href: thread.threadUrl,
    sourceTypes: ["Gmail"],
    text,
    occurredAt: thread.lastMessageAt,
    interactionCount: thread.messageCount,
    hasUserReply: thread.hasUserReply,
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    classificationSignals: unique([...(thread.classificationSignals ?? []), ...classification.signals]),
    evidence: [
      matchEvidence("Conversation", "Gmail thread", thread.subject ?? thread.snippet, "Gmail", thread.id),
      ...(thread.snippet ? [matchEvidence("Matched excerpt", "Snippet", thread.snippet, "Gmail", thread.id)] : []),
    ],
    metadata: { threadId: thread.id, providerThreadId: thread.providerThreadId, contactId: thread.contactId },
  };
}

function meetingCandidate(event: CalendarRecord): NetworkCandidate {
  const classification = classifyRecord({ entityType: "MEETING", title: event.title, attendeeCount: event.attendees.length });
  const text = normalizedText([
    event.title,
    event.description,
    event.location,
    event.attendees.join(" "),
    event.contact?.fullName,
    event.contact?.organization,
    event.contact?.title,
  ]);
  return {
    id: `meeting:${event.id}`,
    entityType: "MEETING",
    title: event.title ?? "Calendar event",
    subtitle: `${event.attendees.length} attendee${event.attendees.length === 1 ? "" : "s"}`,
    href: event.htmlLink,
    sourceTypes: ["Google Calendar"],
    text,
    occurredAt: event.startsAt,
    interactionCount: 1,
    classification: classification.classification,
    classificationConfidence: classification.confidence,
    classificationSignals: classification.signals,
    evidence: [
      matchEvidence("Meeting", "Calendar event", event.title, "Google Calendar", event.id),
      matchEvidence("Attendees", "Attendee emails", event.attendees.join(", "), "Google Calendar", event.id),
    ],
    metadata: { calendarEventId: event.id, contactId: event.contactId },
  };
}

function broadTextFilters(parsed: ParsedNetworkQuery) {
  const terms = unique([...parsed.positiveKeywords, ...parsed.roles, ...parsed.topics, ...parsed.geographies, ...parsed.companies]).slice(0, 10);
  return terms;
}

export async function executeNetworkSearch(prisma: PrismaClient, userId: string, input: z.infer<typeof networkSearchRequestSchema>) {
  const parsed = parseNetworkObjective(input);
  const terms = broadTextFilters(parsed);
  const textOr = terms.flatMap((term) => [
    { fullName: { contains: term, mode: "insensitive" as const } },
    { primaryEmail: { contains: term, mode: "insensitive" as const } },
    { organization: { contains: term, mode: "insensitive" as const } },
    { title: { contains: term, mode: "insensitive" as const } },
    { notes: { contains: term, mode: "insensitive" as const } },
  ]);
  const threadOr = terms.flatMap((term) => [
    { subject: { contains: term, mode: "insensitive" as const } },
    { snippet: { contains: term, mode: "insensitive" as const } },
    { participantEmails: { has: term.toLowerCase() } },
  ]);
  const eventOr = terms.flatMap((term) => [
    { title: { contains: term, mode: "insensitive" as const } },
    { description: { contains: term, mode: "insensitive" as const } },
    { location: { contains: term, mode: "insensitive" as const } },
    { attendees: { has: term.toLowerCase() } },
  ]);
  const companyOr = terms.flatMap((term) => [
    { name: { contains: term, mode: "insensitive" as const } },
    { domain: { contains: term, mode: "insensitive" as const } },
    { description: { contains: term, mode: "insensitive" as const } },
    { sector: { contains: term, mode: "insensitive" as const } },
    { geography: { contains: term, mode: "insensitive" as const } },
  ]);

  const [contacts, companies, threads, events, relationships] = await Promise.all([
    parsed.entityTypes.some((type) => ["PERSON", "COMPANY", "ORGANIZATION"].includes(type))
      ? prisma.contact.findMany({
          where: {
            userId,
            ...(textOr.length ? { OR: textOr } : {}),
            ...(input.relationshipStrength !== undefined ? { relationshipStrength: { gte: input.relationshipStrength } } : {}),
          },
          include: {
            company: true,
            interactions: { orderBy: { occurredAt: "desc" }, take: 25 },
            gmailThreads: { include: { messages: { orderBy: { internalDate: "desc" }, take: 10 } }, orderBy: { lastMessageAt: "desc" }, take: 8 },
            calendarEvents: { orderBy: { startsAt: "desc" }, take: 8 },
            claims: { orderBy: { createdAt: "desc" }, take: 12 },
          },
          orderBy: [{ lastInteractionAt: "desc" }, { relationshipStrength: "desc" }],
          take: 150,
        })
      : Promise.resolve([]),
    parsed.entityTypes.some((type) => ["COMPANY", "ORGANIZATION"].includes(type))
      ? prisma.company.findMany({
          where: { userId, ...(companyOr.length ? { OR: companyOr } : {}) },
          include: { contacts: { take: 20 }, claims: { take: 20 } },
          take: 100,
        })
      : Promise.resolve([]),
    parsed.entityTypes.includes("CONVERSATION") || parsed.interactionTypes.includes("email")
      ? prisma.gmailThread.findMany({
          where: { userId, ...(threadOr.length ? { OR: threadOr } : {}) },
          include: { contact: true, messages: { orderBy: { internalDate: "desc" }, take: 20 } },
          orderBy: { lastMessageAt: "desc" },
          take: 150,
        })
      : Promise.resolve([]),
    parsed.entityTypes.includes("MEETING") || parsed.interactionTypes.includes("meeting")
      ? prisma.calendarEvent.findMany({
          where: { userId, ...(eventOr.length ? { OR: eventOr } : {}) },
          include: { contact: true },
          orderBy: { startsAt: "desc" },
          take: 150,
        })
      : Promise.resolve([]),
    prisma.relationshipEdge.findMany({ where: { userId }, select: { fromNodeId: true, toNodeId: true }, take: 500 }),
  ]);

  const candidates = [
    ...contacts.map((contact) => contactCandidate(contact, relationships)),
    ...companies.map(companyCandidate),
    ...organizationCandidates(contacts),
    ...threads.map(threadCandidate),
    ...events.map(meetingCandidate),
  ];
  const deduped = dedupeNetworkCandidates(candidates);
  const results = rankNetworkCandidates(parsed, deduped);
  const emptyReasons = results.length
    ? []
    : [
        "No sufficiently supported results matched this search.",
        terms.length ? "Connected records did not contain enough evidence for the requested criteria." : "The objective did not contain enough searchable criteria.",
        parsed.unavailableVerification.length ? "Some requested facts require a configured public research provider." : null,
        input.strictness === "strict" ? "Strict match mode may be too restrictive for the available evidence." : null,
      ].filter(Boolean) as string[];

  return {
    interpreted: parsed,
    results,
    emptyReasons,
    counts: {
      contacts: contacts.length,
      companies: companies.length,
      conversations: threads.length,
      meetings: events.length,
      candidates: deduped.length,
    },
  };
}
