import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const textKeys = [
  "oneLineDescription",
  "description",
  "industry",
  "product",
  "problem",
  "solution",
  "targetCustomers",
  "businessModel",
  "revenueModel",
  "fundingStage",
  "headquarters",
  "traction",
  "revenue",
  "pilots",
  "partnerships",
  "team",
  "founderBackgrounds",
  "moat",
  "fundraisingStatus",
  "fundraisingTimeline",
  "customNotes",
] as const;

const arrayKeys = [
  "subIndustries",
  "customerSegments",
  "targetGeographies",
  "keywords",
  "technologies",
  "competitors",
  "preferredInvestorTypes",
  "excludedInvestors",
  "excludedOrganizations",
] as const;

const numberKeys = ["fundingTarget", "minCheckSize", "maxCheckSize", "customerCount"] as const;

const optionalUrl = z
  .string()
  .url("Enter a valid URL.")
  .nullable()
  .default(null);

const optionalText = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .default(null);

const stringArray = z.array(z.string().trim().min(1).max(160)).max(80).default([]);
const optionalNumber = (max: number) =>
  z
    .number({ invalid_type_error: "Enter a valid number." })
    .int("Enter a whole number.")
    .min(0, "Enter a positive number.")
    .max(max, "Enter a smaller number.")
    .nullable()
    .default(null);
const optionalCriteriaNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? null : value),
  z.coerce.number({ invalid_type_error: "Enter a valid number." }).int("Enter a whole number.").min(0, "Enter a positive number.").nullable().default(null),
);

export const startupProfileInputSchema = z.preprocess(normalizeStartupProfileInput, z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1, "Company name is required.").max(160, "Company name must be 160 characters or fewer."),
  website: optionalUrl,
  logoUrl: optionalUrl,
  oneLineDescription: optionalText(220),
  description: optionalText(5000),
  industry: optionalText(160),
  subIndustries: stringArray,
  product: optionalText(2000),
  problem: optionalText(2000),
  solution: optionalText(2000),
  targetCustomers: optionalText(2000),
  customerSegments: stringArray,
  businessModel: optionalText(1000),
  revenueModel: optionalText(1000),
  fundingStage: optionalText(80),
  fundingTarget: optionalNumber(10_000_000_000),
  minCheckSize: optionalNumber(10_000_000_000),
  maxCheckSize: optionalNumber(10_000_000_000),
  headquarters: optionalText(160),
  targetGeographies: stringArray,
  traction: optionalText(2000),
  revenue: optionalText(1000),
  growthMetrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).nullable().default(null),
  customerCount: optionalNumber(10_000_000),
  pilots: optionalText(2000),
  partnerships: optionalText(2000),
  team: optionalText(2000),
  founderBackgrounds: optionalText(2000),
  keywords: stringArray,
  technologies: stringArray,
  moat: optionalText(2000),
  competitors: stringArray,
  preferredInvestorTypes: stringArray,
  excludedInvestors: stringArray,
  excludedOrganizations: stringArray,
  fundraisingStatus: optionalText(1000),
  fundraisingTimeline: optionalText(1000),
  customNotes: optionalText(4000),
  searchCriteria: z.record(z.string(), z.unknown()).nullable().default(null),
}));

export const startupCriteriaSchema = z.object({
  targetPersonTypes: stringArray,
  targetInvestorTypes: stringArray,
  targetIndustries: stringArray,
  targetSubIndustries: stringArray,
  targetStages: stringArray,
  minCheckSize: optionalCriteriaNumber,
  maxCheckSize: optionalCriteriaNumber,
  targetLocations: stringArray,
  geographyPreferences: stringArray,
  targetOrganizations: stringArray,
  desiredTitles: stringArray,
  portfolioKeywords: stringArray,
  technologyKeywords: stringArray,
  relationshipPreferences: stringArray,
  warmIntroductionPreference: z.boolean().default(false),
  excludedInvestors: stringArray,
  excludedPeople: stringArray,
  excludedOrganizations: stringArray,
  excludedKeywords: stringArray,
  customKeywords: stringArray,
  scoringWeights: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

export type StartupProfileInput = z.infer<typeof startupProfileInputSchema>;
export type StartupCriteriaInput = z.infer<typeof startupCriteriaSchema>;

export function normalizeStartupProfileInput(value: unknown) {
  const input = value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, unknown>) } : {};
  if (typeof input.companyName === "string" && typeof input.name !== "string") input.name = input.companyName;
  const normalized: Record<string, unknown> = {
    id: blankToUndefined(input.id),
    name: typeof input.name === "string" ? input.name.trim() : "",
    website: normalizeOptionalUrl(input.website),
    logoUrl: normalizeOptionalUrl(input.logoUrl),
    growthMetrics: objectOrNull(input.growthMetrics),
    searchCriteria: objectOrNull(input.searchCriteria),
  };

  for (const key of textKeys) normalized[key] = normalizeNullableText(input[key]);
  for (const key of arrayKeys) normalized[key] = normalizeStringArray(input[key]);
  for (const key of numberKeys) normalized[key] = normalizeNullableNumber(input[key]);
  return normalized;
}

export function normalizeOptionalUrl(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export function normalizeStringArray(value: unknown) {
  const raw = typeof value === "string" ? value.split(",") : Array.isArray(value) ? value : [];
  return Array.from(new Set(raw.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)));
}

export function normalizeNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : value;
}

const completenessFields: Array<keyof StartupProfileInput> = [
  "name",
  "oneLineDescription",
  "description",
  "industry",
  "product",
  "problem",
  "solution",
  "targetCustomers",
  "fundingStage",
  "fundingTarget",
  "headquarters",
  "traction",
  "team",
  "founderBackgrounds",
  "technologies",
  "preferredInvestorTypes",
];

export function calculateStartupCompleteness(input: Partial<Record<keyof StartupProfileInput, unknown>>) {
  const complete = completenessFields.filter((field) => {
    const value = input[field];
    return Array.isArray(value) ? value.length > 0 : value !== undefined && value !== null && String(value).trim().length > 0;
  }).length;
  return Math.round((complete / completenessFields.length) * 100);
}

export function startupSearchDocument(input: {
  name: string;
  oneLineDescription?: string | null;
  description?: string | null;
  industry?: string | null;
  subIndustries?: string[];
  product?: string | null;
  problem?: string | null;
  solution?: string | null;
  targetCustomers?: string | null;
  technologies?: string[];
  keywords?: string[];
}) {
  return [
    input.name,
    input.oneLineDescription,
    input.description,
    input.industry,
    input.subIndustries?.join(" "),
    input.product,
    input.problem,
    input.solution,
    input.targetCustomers,
    input.technologies?.join(" "),
    input.keywords?.join(" "),
  ]
    .filter(Boolean)
    .join("\n");
}

export async function saveStartupProfile(prisma: PrismaClient, userId: string, input: StartupProfileInput) {
  const data = startupData(input);
  if (input.id) {
    const existing = await prisma.startupProfile.findFirst({ where: { id: input.id, userId }, select: { id: true } });
    if (!existing) throw new Error("Startup profile not found.");
    return prisma.startupProfile.update({ where: { id: input.id }, data });
  }
  return prisma.startupProfile.create({ data: { ...data, userId } });
}

export async function loadStartupProfile(prisma: PrismaClient, userId: string, startupId?: string) {
  if (startupId) return prisma.startupProfile.findFirst({ where: { id: startupId, userId } });
  return prisma.startupProfile.findFirst({ where: { userId, isActive: true }, orderBy: { updatedAt: "desc" } });
}

type StartupProfileData = Omit<Prisma.StartupProfileUncheckedCreateInput, "id" | "userId" | "createdAt" | "updatedAt">;

function startupData(input: StartupProfileInput): StartupProfileData {
  return {
    name: input.name,
    website: input.website ?? null,
    logoUrl: input.logoUrl ?? null,
    oneLineDescription: input.oneLineDescription,
    description: input.description,
    industry: input.industry,
    subIndustries: input.subIndustries,
    product: input.product,
    problem: input.problem,
    solution: input.solution,
    targetCustomers: input.targetCustomers,
    customerSegments: input.customerSegments,
    businessModel: input.businessModel,
    revenueModel: input.revenueModel,
    fundingStage: input.fundingStage,
    fundingTarget: input.fundingTarget ?? null,
    minCheckSize: input.minCheckSize ?? null,
    maxCheckSize: input.maxCheckSize ?? null,
    headquarters: input.headquarters,
    targetGeographies: input.targetGeographies,
    traction: input.traction,
    revenue: input.revenue,
    growthMetrics: input.growthMetrics ? (input.growthMetrics as Prisma.InputJsonObject) : Prisma.JsonNull,
    customerCount: input.customerCount ?? null,
    pilots: input.pilots,
    partnerships: input.partnerships,
    team: input.team,
    founderBackgrounds: input.founderBackgrounds,
    keywords: input.keywords,
    technologies: input.technologies,
    moat: input.moat,
    competitors: input.competitors,
    preferredInvestorTypes: input.preferredInvestorTypes,
    excludedInvestors: input.excludedInvestors,
    excludedOrganizations: input.excludedOrganizations,
    fundraisingStatus: input.fundraisingStatus,
    fundraisingTimeline: input.fundraisingTimeline,
    customNotes: input.customNotes,
    searchCriteria: input.searchCriteria ? (input.searchCriteria as Prisma.InputJsonObject) : Prisma.JsonNull,
    profileCompleteness: calculateStartupCompleteness(input),
  };
}

function normalizeNullableText(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  return trimmed || null;
}

function blankToUndefined(value: unknown) {
  return typeof value === "string" && value.trim() === "" ? undefined : value;
}

function objectOrNull(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : null;
}
