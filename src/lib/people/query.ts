import { PersonType } from "@prisma/client";
import type { InterpretedPeopleCriteria, PeopleSearchFilters } from "./types";

const PERSON_TYPE_HINTS: Array<[PersonType, RegExp]> = [
  [PersonType.INVESTOR, /\b(investors?|angels?|venture|vc|funds?|checks?|capital|backers?)\b/i],
  [PersonType.FOUNDER, /\b(founders?|co[-\s]?founders?|entrepreneurs?)\b/i],
  [PersonType.OPERATOR, /\b(operators?|executives?|leaders?|heads? of|vp|chief|cxo)\b/i],
  [PersonType.ADVISOR, /\b(advisors?|mentors?)\b/i],
  [PersonType.ACCELERATOR, /\b(accelerators?|incubators?|programs?)\b/i],
  [PersonType.SCOUT, /\b(scouts?)\b/i],
  [PersonType.RESEARCHER, /\b(researchers?|professors?|academics?|scientists?|labs?)\b/i],
  [PersonType.POTENTIAL_CUSTOMER, /\b(customers?|buyers?|procurement|users?|cios?|cto?s?)\b/i],
  [PersonType.STRATEGIC_PARTNER, /\b(strategic partners?|partners?|partnerships?|channel partners?)\b/i],
];

const INDUSTRY_HINTS = [
  "defense ai",
  "defense technology",
  "dual-use",
  "national security",
  "autonomy",
  "robotics",
  "drones",
  "unmanned systems",
  "geospatial intelligence",
  "climate",
  "climate risk",
  "ai infrastructure",
  "software infrastructure",
  "cybersecurity",
  "frontier ai",
  "healthcare",
  "fintech",
  "energy",
  "manufacturing",
  "logistics",
  "space",
];

const STAGE_HINTS = ["pre-seed", "pre seed", "seed", "series a", "series b", "growth", "mvp", "private beta", "public beta"];
const LOCATION_HINTS = [
  "Bay Area",
  "San Francisco",
  "Silicon Valley",
  "New York",
  "Boston",
  "Austin",
  "Los Angeles",
  "Ukraine",
  "Europe",
  "United Kingdom",
  "Germany",
  "France",
  "Israel",
  "Canada",
  "Berkeley",
];

export function interpretPeopleSearchObjective(input: {
  query: string;
  filters?: Partial<PeopleSearchFilters>;
  startupCriteria?: unknown;
}): InterpretedPeopleCriteria {
  const query = input.query.trim();
  const filters = input.filters;
  const startupCriteria = criteriaObject(input.startupCriteria);
  const types = uniqueEnums([
    ...(filters?.personTypes ?? []),
    ...PERSON_TYPE_HINTS.filter(([, regex]) => regex.test(query)).map(([type]) => type),
    ...parseStartupPersonTypes(startupCriteria.targetPersonTypes),
  ]);

  const lower = query.toLowerCase();
  const stages = uniqueStrings([
    ...(filters?.stages ?? []),
    ...STAGE_HINTS.filter((stage) => lower.includes(stage)),
    ...stringsFromUnknown(startupCriteria.targetStages),
  ]).map((stage) => stage.replace("pre seed", "pre-seed"));

  const locations = uniqueStrings([
    ...(filters?.locations ?? []),
    ...LOCATION_HINTS.filter((location) => new RegExp(`\\b${escapeRegExp(location)}\\b`, "i").test(query)),
    ...stringsFromUnknown(startupCriteria.targetLocations),
  ]);

  const technologyKeywords = uniqueStrings([
    ...(filters?.technologyKeywords ?? []),
    ...extractAfterPhrases(query, ["working on", "building", "using", "for", "about"]),
    ...stringsFromUnknown(startupCriteria.technologyKeywords),
  ]).slice(0, 16);

  const industries = uniqueStrings([
    ...(filters?.industries ?? []),
    ...INDUSTRY_HINTS.filter((industry) => lower.includes(industry)),
    ...stringsFromUnknown(startupCriteria.targetIndustries),
  ]);

  const organizations = uniqueStrings([
    ...(filters?.organizations ?? []),
    ...extractCapitalizedAfter(query, ["at", "from", "associated with", "backing"]),
    ...stringsFromUnknown(startupCriteria.targetOrganizations),
  ]).slice(0, 12);

  const titles = uniqueStrings([
    ...(filters?.titles ?? []),
    ...extractTitles(query),
    ...stringsFromUnknown(startupCriteria.desiredTitles),
  ]);

  const portfolioKeywords = uniqueStrings([
    ...(filters?.portfolioKeywords ?? []),
    ...extractAfterPhrases(query, ["portfolio includes", "backing", "backed", "invested in"]),
    ...stringsFromUnknown(startupCriteria.portfolioKeywords),
  ]).slice(0, 16);

  const checkRange = parseCheckRange(query);
  const warmIntroductionPreference =
    filters?.warmIntroductionAvailable === true || /\b(warm|intro|introduction|introduced|path)\b/i.test(query);

  return {
    semanticText: query,
    personTypes: types,
    industries,
    stages,
    checkSizeMin: filters?.minCheckSize ?? checkRange.min ?? numberFromUnknown(startupCriteria.minCheckSize),
    checkSizeMax: filters?.maxCheckSize ?? checkRange.max ?? numberFromUnknown(startupCriteria.maxCheckSize),
    locations,
    geographyPreferences: uniqueStrings([
      ...(filters?.geographyPreferences ?? []),
      ...locations,
      ...stringsFromUnknown(startupCriteria.geographyPreferences),
    ]),
    organizations,
    titles,
    portfolioKeywords,
    technologyKeywords,
    relationshipRequirements: relationshipRequirements(query, filters),
    warmIntroductionPreference,
    excludedTerms: uniqueStrings([
      ...extractExcludedTerms(query),
      ...stringsFromUnknown(startupCriteria.excludedKeywords),
      ...stringsFromUnknown(startupCriteria.excludedPeople),
      ...stringsFromUnknown(startupCriteria.excludedInvestors),
      ...stringsFromUnknown(startupCriteria.excludedOrganizations),
    ]),
    sortPreference: /\b(recent|latest|last)\b/i.test(query)
      ? "recency"
      : warmIntroductionPreference || filters?.relationshipStatus === "warm"
        ? "relationship"
        : "fit",
  };
}

function relationshipRequirements(query: string, filters?: Partial<PeopleSearchFilters>) {
  const requirements = new Set<string>();
  if (filters?.relationshipStatus && filters.relationshipStatus !== "any") requirements.add(filters.relationshipStatus);
  if (filters?.googleContactPresence === "present") requirements.add("google_contact");
  if (filters?.directGmailHistory === "present") requirements.add("gmail_history");
  if (/\b(spoke|emailed|met|communicated|conversation|relationship)\b/i.test(query)) requirements.add("known_relationship");
  if (/\b(warm|intro|introduction|introduced|path)\b/i.test(query)) requirements.add("warm_intro");
  return Array.from(requirements);
}

function extractTitles(query: string) {
  const titles = new Set<string>();
  for (const match of query.matchAll(/\b(founder|co[-\s]?founder|partner|principal|operator|advisor|professor|researcher|scout|recruiter|cto|cio|vp|head of [a-z ]{2,40})\b/gi)) {
    titles.add(match[1]!.replace(/\s+/g, " ").trim());
  }
  return Array.from(titles);
}

function extractAfterPhrases(query: string, phrases: string[]) {
  const values = new Set<string>();
  for (const phrase of phrases) {
    const regex = new RegExp(`${escapeRegExp(phrase)}\\s+([^.,;?]{3,90})`, "i");
    const match = query.match(regex);
    if (match?.[1]) {
      for (const part of match[1].split(/\band\b|,|\/|\+/i)) {
        const normalized = part.trim().replace(/\b(whom|who|with|before|after|between|from|in)$/i, "").trim();
        if (normalized.length > 2) values.add(normalized);
      }
    }
  }
  return Array.from(values);
}

function extractCapitalizedAfter(query: string, phrases: string[]) {
  const values = new Set<string>();
  for (const phrase of phrases) {
    const regex = new RegExp(`${escapeRegExp(phrase)}\\s+([A-Z][A-Za-z0-9&.\\-]+(?:\\s+[A-Z][A-Za-z0-9&.\\-]+){0,4})`, "g");
    for (const match of query.matchAll(regex)) {
      if (match[1]) values.add(match[1].trim());
    }
  }
  return Array.from(values);
}

function extractExcludedTerms(query: string) {
  const values = new Set<string>();
  for (const match of query.matchAll(/\b(?:excluding|exclude|not|except)\s+([^.,;?]{2,80})/gi)) {
    for (const term of (match[1] ?? "").split(/,|\band\b/i)) {
      const value = term.trim();
      if (value) values.add(value);
    }
  }
  return Array.from(values);
}

function parseCheckRange(query: string) {
  const between = query.match(/\bbetween\s+\$?([0-9.]+)\s*([kKmM]?)\s+(?:and|-|to)\s+\$?([0-9.]+)\s*([kKmM]?)/);
  if (between) {
    return { min: money(between[1]!, between[2]!), max: money(between[3]!, between[4]!) };
  }
  const under = query.match(/\b(?:under|below|max(?:imum)?)\s+\$?([0-9.]+)\s*([kKmM]?)/i);
  if (under) return { max: money(under[1]!, under[2]!) };
  const over = query.match(/\b(?:over|above|min(?:imum)?)\s+\$?([0-9.]+)\s*([kKmM]?)/i);
  if (over) return { min: money(over[1]!, over[2]!) };
  return {};
}

function money(value: string, unit: string) {
  const amount = Number(value);
  const normalized = unit.toLowerCase();
  if (normalized === "k") return Math.round(amount * 1_000);
  if (normalized === "m") return Math.round(amount * 1_000_000);
  return Math.round(amount);
}

function criteriaObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function stringsFromUnknown(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function numberFromUnknown(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseStartupPersonTypes(values: unknown) {
  return stringsFromUnknown(values)
    .map((value) => value.toUpperCase().replaceAll(" ", "_").replaceAll("-", "_"))
    .filter((value): value is PersonType => value in PersonType);
}

function uniqueEnums(values: PersonType[]) {
  return Array.from(new Set(values));
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
        .map((value) => value.replace(/\s+/g, " ")),
    ),
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
