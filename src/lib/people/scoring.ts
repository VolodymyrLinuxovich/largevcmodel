import { PersonType, type DiscoveredPerson, type PersonRelationshipEnrichment, type StartupProfile } from "@prisma/client";
import { fullTextScore, semanticSimilarity } from "./semantic";
import { expandGeographyTerms, expandIndustryTerms, expandStageTerms } from "./search-taxonomy";

export type CriterionState = {
  criterion: string;
  state: "matched" | "missing" | "uncertain" | "contradicted";
  label: string;
  value?: string | null;
  source: string;
  confidence?: number | null;
};

export type PeopleFitScore = {
  overall: number;
  confidence: number;
  components: Array<{ key: string; label: string; score: number; weight: number; evidence: string }>;
  explanation: string;
  matchedCriteria: CriterionState[];
  missingCriteria: CriterionState[];
  uncertainCriteria: CriterionState[];
  sourceCoverage: { sourceCount: number; claimConfidence: number; fieldsWithSources: string[] };
  relationshipContribution: number;
};

const DEFAULT_WEIGHTS: Record<string, number> = {
  thesis: 30,
  stage: 20,
  technology: 15,
  checkSize: 10,
  geography: 10,
  portfolio: 10,
  relationship: 5,
};

const TYPE_WEIGHTS: Partial<Record<PersonType, Record<string, number>>> = {
  [PersonType.FOUNDER]: { thesis: 20, stage: 5, technology: 25, checkSize: 0, geography: 10, portfolio: 25, relationship: 15 },
  [PersonType.OPERATOR]: { thesis: 20, stage: 0, technology: 25, checkSize: 0, geography: 10, portfolio: 30, relationship: 15 },
  [PersonType.RESEARCHER]: { thesis: 25, stage: 0, technology: 35, checkSize: 0, geography: 10, portfolio: 20, relationship: 10 },
  [PersonType.POTENTIAL_CUSTOMER]: { thesis: 30, stage: 0, technology: 20, checkSize: 0, geography: 20, portfolio: 20, relationship: 10 },
  [PersonType.STRATEGIC_PARTNER]: { thesis: 25, stage: 0, technology: 25, checkSize: 0, geography: 15, portfolio: 25, relationship: 10 },
  [PersonType.ACCELERATOR]: { thesis: 25, stage: 20, technology: 15, checkSize: 0, geography: 15, portfolio: 15, relationship: 10 },
};

export function calculatePeopleFitScore(input: {
  startup: StartupProfile;
  person: DiscoveredPerson;
  relationship?: PersonRelationshipEnrichment | null;
  interpretedCriteria?: { semanticText?: string; excludedTerms?: string[] };
}) {
  const weights = normalizeWeights(TYPE_WEIGHTS[primaryType(input.person)] ?? DEFAULT_WEIGHTS);
  const matched: CriterionState[] = [];
  const missing: CriterionState[] = [];
  const uncertain: CriterionState[] = [];

  const startupDoc = startupDocument(input.startup);
  const personDoc = input.person.searchText || personDocument(input.person);
  const semantic = semanticSimilarity(input.interpretedCriteria?.semanticText || startupDoc, personDoc);
  const thesisScore = Math.round(Math.max(fullTextScore(startupDoc, personDoc), semantic) * 100);
  pushState(thesisScore, "Thesis or market fit", "Startup-market language", matchingText(input.startup.industry, input.person.industries), matched, missing, uncertain);

  const stageScore = stageOverlap(input.startup.fundingStage, input.person.preferredStages);
  if (weights.stage > 0) pushState(stageScore, "Funding-stage fit", "Stage", input.person.preferredStages.join(", "), matched, missing, uncertain);

  const technologyScore = overlapScore(
    expandIndustryTerms([...input.startup.technologies, ...input.startup.keywords]),
    expandIndustryTerms([...input.person.technologies, ...input.person.keywords, ...input.person.skills]),
  );
  pushState(technologyScore, "Product and technology fit", "Technology", input.person.technologies.join(", "), matched, missing, uncertain);

  const checkScore = checkSizeScore(input.startup.minCheckSize, input.startup.maxCheckSize, input.person.minCheckSize, input.person.maxCheckSize);
  if (weights.checkSize > 0) pushState(checkScore, "Check-size fit", "Check range", checkRange(input.person.minCheckSize, input.person.maxCheckSize), matched, missing, uncertain);

  const geographyScore = overlapScore(
    expandGeographyTerms(input.startup.targetGeographies),
    expandGeographyTerms([...input.person.geographyPreferences, input.person.location].filter(Boolean) as string[]),
  );
  pushState(geographyScore, "Geography fit", "Geography", [input.person.location, ...input.person.geographyPreferences].filter(Boolean).join(", "), matched, missing, uncertain);

  const portfolioScore = overlapScore(
    expandIndustryTerms([...input.startup.subIndustries, ...input.startup.customerSegments, input.startup.product ?? ""]),
    expandIndustryTerms([...input.person.portfolioCompanies, ...input.person.notableInvestments, input.person.notableExperience ?? "", input.person.biography ?? ""]),
  );
  pushState(portfolioScore, "Portfolio or operating relevance", "Relevant experience", input.person.portfolioCompanies.slice(0, 4).join(", ") || input.person.notableExperience, matched, missing, uncertain);

  const relationshipScore = input.relationship?.relationshipStrength ?? 0;
  if (relationshipScore > 0) {
    matched.push({
      criterion: "Relationship",
      state: "matched",
      label: "Connected-account relationship",
      value: relationshipSummary(input.relationship),
      source: "Gmail and Google Contacts enrichment",
      confidence: input.relationship?.confidence ?? null,
    });
  } else {
    uncertain.push({
      criterion: "Relationship",
      state: "uncertain",
      label: "Connected-account relationship",
      value: "No known relationship found",
      source: "Gmail and Google Contacts enrichment",
      confidence: 80,
    });
  }

  const componentInputs = [
    ["thesis", "Investment thesis / market", thesisScore, "Language and semantic overlap with the startup profile."],
    ["stage", "Funding stage", stageScore, "Overlap between company stage and stated preferred stages."],
    ["technology", "Product and technology", technologyScore, "Overlap with startup technologies and keywords."],
    ["checkSize", "Check size", checkScore, "Overlap between target check size and person or organization range."],
    ["geography", "Geography", geographyScore, "Overlap with headquarters, target markets, and geography preferences."],
    ["portfolio", "Portfolio / experience", portfolioScore, "Relevant portfolio, experience, or operating background."],
    ["relationship", "Relationship", relationshipScore, "Private Gmail and Google Contacts enrichment only."],
  ] as const;
  const components = componentInputs.map(([key, label, score, evidence]) => ({
    key,
    label,
    score,
    weight: weights[key],
    evidence,
  }));
  const overall = Math.round(components.reduce((sum, component) => sum + component.score * (component.weight / 100), 0));
  const sourceConfidence = input.person.sourceConfidence ?? 0;
  const completeness = fieldCompleteness(input.person);
  const confidence = Math.round(Math.min(96, Math.max(15, sourceConfidence * 0.55 + completeness * 0.3 + (input.relationship?.confidence ?? 0) * 0.15)));

  return {
    overall: Math.max(0, Math.min(100, overall)),
    confidence,
    components,
    explanation: explain(input.person, overall, matched, missing, uncertain),
    matchedCriteria: matched,
    missingCriteria: missing,
    uncertainCriteria: uncertain,
    sourceCoverage: {
      sourceCount: sourceConfidence > 0 ? 1 : 0,
      claimConfidence: sourceConfidence,
      fieldsWithSources: matched.map((item) => item.criterion),
    },
    relationshipContribution: Math.round(relationshipScore * (weights.relationship / 100)),
  } satisfies PeopleFitScore;
}

export function normalizeWeights(weights: Record<string, number>) {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(weights).map(([key, value]) => [key, Math.round((value / total) * 100)])) as Record<string, number>;
}

function primaryType(person: DiscoveredPerson) {
  return person.personTypes[0] ?? PersonType.INVESTOR;
}

function startupDocument(startup: StartupProfile) {
  return [
    startup.name,
    startup.oneLineDescription,
    startup.description,
    startup.industry,
    startup.subIndustries.join(" "),
    startup.product,
    startup.problem,
    startup.solution,
    startup.targetCustomers,
    startup.customerSegments.join(" "),
    startup.technologies.join(" "),
    startup.keywords.join(" "),
    startup.moat,
  ]
    .filter(Boolean)
    .join(" ");
}

function personDocument(person: DiscoveredPerson) {
  return [
    person.fullName,
    person.currentTitle,
    person.currentOrganizationName,
    person.biography,
    person.investmentThesis,
    person.industries.join(" "),
    person.subIndustries.join(" "),
    person.portfolioCompanies.join(" "),
    person.notableInvestments.join(" "),
    person.notableExperience,
    person.technologies.join(" "),
    person.keywords.join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function overlapScore(left: string[], right: string[]) {
  const l = tokens(left.join(" "));
  const r = tokens(right.join(" "));
  if (!l.size || !r.size) return 0;
  let matches = 0;
  for (const token of l) if (r.has(token)) matches += 1;
  return Math.round((matches / l.size) * 100);
}

function stageOverlap(stage: string | null, preferred: string[]) {
  if (!stage && !preferred.length) return 0;
  if (!stage || !preferred.length) return 18;
  const requested = expandStageTerms([stage]).map((item) => item.toLowerCase().replace(/\s+/g, "-"));
  const available = expandStageTerms(preferred).map((item) => item.toLowerCase().replace(/\s+/g, "-"));
  return requested.some((left) => available.some((right) => right.includes(left) || left.includes(right))) ? 100 : 15;
}

function checkSizeScore(startupMin: number | null, startupMax: number | null, personMin: number | null, personMax: number | null) {
  if (!startupMin && !startupMax && !personMin && !personMax) return 0;
  if ((!startupMin && !startupMax) || (!personMin && !personMax)) return 20;
  const aMin = startupMin ?? 0;
  const aMax = startupMax ?? startupMin ?? 10_000_000_000;
  const bMin = personMin ?? 0;
  const bMax = personMax ?? personMin ?? 10_000_000_000;
  return Math.max(aMin, bMin) <= Math.min(aMax, bMax) ? 100 : 10;
}

function pushState(
  score: number,
  criterion: string,
  label: string,
  value: string | null | undefined,
  matched: CriterionState[],
  missing: CriterionState[],
  uncertain: CriterionState[],
) {
  if (score >= 55) {
    matched.push({ criterion, state: "matched", label, value: value || "Supported overlap", source: "Public research provider", confidence: score });
  } else if (score > 0) {
    uncertain.push({ criterion, state: "uncertain", label, value: value || "Partial evidence", source: "Public research provider", confidence: score });
  } else {
    missing.push({ criterion, state: "missing", label, value: null, source: "Public research provider", confidence: null });
  }
}

function matchingText(left?: string | null, right?: string[]) {
  if (left && right?.length) return `${left} / ${right.slice(0, 3).join(", ")}`;
  return left ?? right?.slice(0, 3).join(", ") ?? null;
}

function checkRange(min?: number | null, max?: number | null) {
  if (!min && !max) return null;
  return `${min ? `$${min.toLocaleString()}` : "unknown"} - ${max ? `$${max.toLocaleString()}` : "unknown"}`;
}

function relationshipSummary(relationship?: PersonRelationshipEnrichment | null) {
  if (!relationship) return "No known relationship";
  const parts = [];
  if (relationship.gmailThreadCount) parts.push(`${relationship.gmailThreadCount} Gmail thread${relationship.gmailThreadCount === 1 ? "" : "s"}`);
  if (relationship.googleContactPresent) parts.push("saved in Google Contacts");
  if (relationship.mostRecentInteraction) parts.push(`last interaction ${relationship.mostRecentInteraction.toISOString().slice(0, 10)}`);
  return parts.join("; ") || "Relationship evidence present";
}

function explain(person: DiscoveredPerson, overall: number, matched: CriterionState[], missing: CriterionState[], uncertain: CriterionState[]) {
  const type = (person.personTypes[0] ?? PersonType.INVESTOR).toLowerCase().replaceAll("_", " ");
  const evidence = matched.slice(0, 3).map((item) => item.criterion.toLowerCase()).join(", ");
  const gaps = [...missing, ...uncertain].slice(0, 2).map((item) => item.criterion.toLowerCase()).join(", ");
  const strength = overall >= 75 ? "Strong" : overall >= 50 ? "Moderate" : "Exploratory";
  return `${strength} ${type} match${evidence ? ` based on ${evidence}` : ""}.${gaps ? ` Missing or uncertain: ${gaps}.` : ""}`;
}

function fieldCompleteness(person: DiscoveredPerson) {
  const fields = [
    person.currentTitle,
    person.currentOrganizationName,
    person.location,
    person.biography,
    person.investmentThesis,
    person.industries.length,
    person.preferredStages.length,
    person.technologies.length,
    person.portfolioCompanies.length,
  ];
  return Math.round((fields.filter(Boolean).length / fields.length) * 100);
}

function tokens(text: string) {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 2),
  );
}
