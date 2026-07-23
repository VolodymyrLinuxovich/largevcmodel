import "server-only";

import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";

const optionalUrl = z
  .string()
  .trim()
  .optional()
  .transform((value) => value || undefined)
  .pipe(z.string().url().optional());

const optionalText = (max = 4000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((value) => value || undefined);

const stringArray = z.array(z.string().trim().min(1).max(160)).max(80).default([]);

export const startupProfileInputSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(1).max(160),
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
  fundingTarget: z.coerce.number().int().min(0).max(10_000_000_000).optional().nullable(),
  minCheckSize: z.coerce.number().int().min(0).max(10_000_000_000).optional().nullable(),
  maxCheckSize: z.coerce.number().int().min(0).max(10_000_000_000).optional().nullable(),
  headquarters: optionalText(160),
  targetGeographies: stringArray,
  traction: optionalText(2000),
  revenue: optionalText(1000),
  growthMetrics: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  customerCount: z.coerce.number().int().min(0).max(10_000_000).optional().nullable(),
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
  searchCriteria: z.record(z.string(), z.unknown()).optional(),
});

export const startupCriteriaSchema = z.object({
  targetPersonTypes: stringArray,
  targetInvestorTypes: stringArray,
  targetIndustries: stringArray,
  targetSubIndustries: stringArray,
  targetStages: stringArray,
  minCheckSize: z.coerce.number().int().min(0).optional().nullable(),
  maxCheckSize: z.coerce.number().int().min(0).optional().nullable(),
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
    website: input.website,
    logoUrl: input.logoUrl,
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
    growthMetrics: input.growthMetrics as Prisma.InputJsonObject | undefined,
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
    searchCriteria: input.searchCriteria as Prisma.InputJsonObject | undefined,
    profileCompleteness: calculateStartupCompleteness(input),
  };
}
