import { PersonType, ProviderHealthStatus } from "@prisma/client";
import { z } from "zod";
import { splitListInput } from "./search-taxonomy";

export const personTypeSchema = z.nativeEnum(PersonType);

const looseStringArray = z.preprocess(
  splitListInput,
  z.array(z.string().trim().min(1)).default([]),
);

const optionalFilterNumber = z.preprocess(
  (value) => (value === "" || value === null || value === undefined ? undefined : value),
  z.coerce.number().int().min(0).optional().nullable(),
);

export const peopleSearchFiltersSchema = z.object({
  personTypes: z.array(personTypeSchema).default([]),
  industries: looseStringArray,
  subIndustries: looseStringArray,
  stages: looseStringArray,
  minCheckSize: optionalFilterNumber,
  maxCheckSize: optionalFilterNumber,
  locations: looseStringArray,
  geographyPreferences: looseStringArray,
  organizations: looseStringArray,
  titles: looseStringArray,
  portfolioKeywords: looseStringArray,
  technologyKeywords: looseStringArray,
  relationshipStatus: z.enum(["any", "known", "unknown", "warm"]).default("any"),
  googleContactPresence: z.enum(["any", "present", "absent"]).default("any"),
  directGmailHistory: z.enum(["any", "present", "absent"]).default("any"),
  warmIntroductionAvailable: z.boolean().optional(),
  minSourceConfidence: z.coerce.number().int().min(0).max(100).optional(),
  savedOnly: z.boolean().default(false),
  externallyDiscovered: z.boolean().optional(),
  manuallyAdded: z.boolean().optional(),
  matchMode: z.enum(["compatible", "strict"]).default("compatible"),
});

export const peopleSearchRequestSchema = z.object({
  startupId: z.string().trim().min(1).optional().nullable(),
  query: z.string().trim().min(2).max(1200),
  filters: peopleSearchFiltersSchema.default({}),
  limit: z.coerce.number().int().min(1).max(50).default(12),
  offset: z.coerce.number().int().min(0).max(1000).default(0),
});

export type PeopleSearchFilters = z.infer<typeof peopleSearchFiltersSchema>;
export type PeopleSearchRequest = z.infer<typeof peopleSearchRequestSchema>;

export type PeopleSearchRejection = {
  candidate: string;
  rejectedAt: string;
  reasons: string[];
};

export type PeopleProviderDiagnostics = {
  stage?: string;
  model?: string;
  toolType?: string;
  webSearchExecuted: boolean;
  webSearchCallCount: number;
  citationsCount?: number;
  researchQueries: string[];
  rawCandidateCount: number;
  parsedCandidateCount: number;
  candidatesWithValidNames: number;
  candidatesWithValidSourceUrls: number;
  rejectedCandidates: PeopleSearchRejection[];
  requestDurationMs?: number;
};

export type PeopleSearchDiagnostics = {
  interpretedCriteria: InterpretedPeopleCriteria;
  normalizedFilters: PeopleSearchFilters;
  providerStatus: PeopleProviderStatus;
  providerDiagnostics?: PeopleProviderDiagnostics;
  counts: {
    rawProviderCandidates: number;
    parsedProviderCandidates: number;
    candidatesWithValidNames: number;
    candidatesWithValidSourceUrls: number;
    normalizedCandidates: number;
    dedupedCandidates: number;
    afterHardFilters: number;
    scoredCandidates: number;
    returnedCandidates: number;
  };
  rejectionCounts: Record<string, number>;
  rejections: PeopleSearchRejection[];
  rankingThreshold: number;
  durationMs: number;
};

export type InterpretedPeopleCriteria = {
  semanticText: string;
  personTypes: PersonType[];
  industries: string[];
  stages: string[];
  checkSizeMin?: number | null;
  checkSizeMax?: number | null;
  locations: string[];
  geographyPreferences: string[];
  organizations: string[];
  titles: string[];
  portfolioKeywords: string[];
  technologyKeywords: string[];
  relationshipRequirements: string[];
  warmIntroductionPreference: boolean;
  excludedTerms: string[];
  sortPreference: "fit" | "relationship" | "recency";
};

export type PeopleProviderSource = {
  title: string;
  url: string;
  publisher?: string | null;
  publishedAt?: string | null;
  accessedAt: string;
  snippet?: string | null;
  sourceType: string;
  supportsClaims: string[];
  confidence?: number | null;
};

export type PeopleProviderClaim = {
  text: string;
  fieldKey?: string | null;
  confidence?: number | null;
  sourceUrls: string[];
};

export type PeopleProviderOrganization = {
  providerOrgId?: string | null;
  name: string;
  type?: string | null;
  website?: string | null;
  domain?: string | null;
  description?: string | null;
  location?: string | null;
  industries?: string[];
  investmentStages?: string[];
  minCheckSize?: number | null;
  maxCheckSize?: number | null;
  portfolio?: string[];
  publicUrls?: string[];
  sourceConfidence?: number | null;
  sources?: PeopleProviderSource[];
  claims?: PeopleProviderClaim[];
};

export type PeopleProviderPerson = {
  providerPersonId?: string | null;
  fullName: string;
  firstName?: string | null;
  lastName?: string | null;
  currentTitle?: string | null;
  currentOrganization?: PeopleProviderOrganization | null;
  currentOrganizationName?: string | null;
  previousOrganizations?: string[];
  personTypes?: PersonType[];
  location?: string | null;
  biography?: string | null;
  investmentThesis?: string | null;
  industries?: string[];
  subIndustries?: string[];
  preferredStages?: string[];
  minCheckSize?: number | null;
  maxCheckSize?: number | null;
  geographyPreferences?: string[];
  portfolioCompanies?: string[];
  notableInvestments?: string[];
  notableExperience?: string | null;
  education?: string[];
  skills?: string[];
  keywords?: string[];
  technologies?: string[];
  emailAddresses?: string[];
  organizationDomain?: string | null;
  linkedinUrl?: string | null;
  xUrl?: string | null;
  personalWebsite?: string | null;
  publicProfileUrls?: string[];
  sourceConfidence?: number | null;
  fieldConfidence?: Record<string, number>;
  conflictingClaims?: Record<string, string[]>;
  sources: PeopleProviderSource[];
  claims: PeopleProviderClaim[];
};

export type PeopleProviderStatus = {
  name: string;
  status: ProviderHealthStatus;
  message: string;
  rateLimit?: { remaining?: number; resetAt?: string };
};

export type PeopleProviderSearchInput = {
  query: string;
  interpreted: InterpretedPeopleCriteria;
  startup: {
    id: string;
    name: string;
    website?: string | null;
    oneLineDescription?: string | null;
    description?: string | null;
    industry?: string | null;
    subIndustries: string[];
    product?: string | null;
    problem?: string | null;
    solution?: string | null;
    targetCustomers?: string | null;
    fundingStage?: string | null;
    fundingTarget?: number | null;
    minCheckSize?: number | null;
    maxCheckSize?: number | null;
    targetGeographies: string[];
    technologies: string[];
    keywords: string[];
    preferredInvestorTypes: string[];
    excludedInvestors: string[];
    excludedOrganizations: string[];
    searchCriteria?: unknown;
  };
  limit: number;
};

export type PeopleProviderSearchResult = {
  provider: string;
  status: PeopleProviderStatus;
  people: PeopleProviderPerson[];
  organizations: PeopleProviderOrganization[];
  latencyMs: number;
  partial: boolean;
  error?: string;
  diagnostics?: PeopleProviderDiagnostics;
};
