import { PersonType } from "@prisma/client";

const INDUSTRY_ALIASES: Record<string, string[]> = {
  miltech: [
    "miltech",
    "military technology",
    "defense technology",
    "defence technology",
    "defense tech",
    "defence tech",
    "national security",
    "aerospace and defense",
    "aerospace and defence",
    "dual use",
    "dual-use",
    "autonomous defense systems",
    "autonomous defence systems",
  ],
  ai: [
    "ai",
    "artificial intelligence",
    "machine learning",
    "autonomy",
    "intelligent systems",
    "computer vision",
    "decision intelligence",
  ],
};

const STAGE_ALIASES: Record<string, string[]> = {
  seed: ["seed", "pre-seed", "pre seed", "early stage", "early-stage", "pre-series a", "pre series a", "seed to series a"],
};

const GEOGRAPHY_ALIASES: Record<string, string[]> = {
  europe: [
    "europe",
    "european",
    "uk",
    "united kingdom",
    "england",
    "london",
    "france",
    "paris",
    "germany",
    "berlin",
    "munich",
    "sweden",
    "stockholm",
    "norway",
    "denmark",
    "finland",
    "netherlands",
    "amsterdam",
    "switzerland",
    "zurich",
    "spain",
    "italy",
    "poland",
    "estonia",
    "latvia",
    "lithuania",
    "ukraine",
  ],
};

const INVESTMENT_ROLE_PATTERN = /\b(investor|partner|general partner|managing partner|principal|venture partner|investment director|investment manager|associate|vc|venture capital|angel|founding partner|fund manager)\b/i;

export function splitListInput(value: unknown) {
  const raw = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  return Array.from(
    new Set(
      raw
        .flatMap((item) => (typeof item === "string" ? item.split(",") : []))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  );
}

export function normalizeTerm(value: string) {
  return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}

export function expandIndustryTerms(values: string[]) {
  return expandTerms(values, INDUSTRY_ALIASES);
}

export function expandStageTerms(values: string[]) {
  return expandTerms(values, STAGE_ALIASES);
}

export function expandGeographyTerms(values: string[]) {
  return expandTerms(values, GEOGRAPHY_ALIASES);
}

export function matchesAnyExpanded(needles: string[], haystack: string[], expand: (values: string[]) => string[] = expandTermsIdentity) {
  const expandedNeedles = expand(needles).map(normalizeTerm).filter(Boolean);
  if (!expandedNeedles.length) return true;
  const haystackText = expand(haystack).map(normalizeTerm).join(" ");
  if (!haystackText.trim()) return null;
  return expandedNeedles.some((needle) => haystackText.includes(needle) || needle.includes(haystackText));
}

export function isInvestmentPersonType(types: PersonType[], title?: string | null) {
  return types.includes(PersonType.INVESTOR) || INVESTMENT_ROLE_PATTERN.test(title ?? "");
}

export function normalizePersonTypes(values: unknown): PersonType[] {
  return splitListInput(values)
    .map((value) => value.toUpperCase().replace(/[-\s]+/g, "_"))
    .map((value) => (value === "CUSTOMER" ? "POTENTIAL_CUSTOMER" : value))
    .filter((value): value is PersonType => value in PersonType);
}

function expandTerms(values: string[], aliases: Record<string, string[]>) {
  const expanded = new Set<string>();
  for (const value of values) {
    const normalized = normalizeTerm(value);
    if (!normalized) continue;
    expanded.add(value);
    expanded.add(normalized);
    const aliasValues = aliases[normalized] ?? aliases[normalized.replace(/\s+/g, "-")] ?? aliases[normalized.replace(/\s+/g, "")];
    for (const alias of aliasValues ?? []) expanded.add(alias);
  }
  return Array.from(expanded);
}

function expandTermsIdentity(values: string[]) {
  return values;
}
