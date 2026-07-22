export type SourceType =
  | "company"
  | "news"
  | "funding"
  | "social"
  | "database"
  | "internal_crm"
  | "other";

export type SourceOrigin = "hermes" | "mock" | "internal_demo";

export type ClaimProvenance = "public_source" | "internal_crm" | "ai_inference" | "unverified";

export type ResearchSourceInput = {
  title: string;
  url: string;
  publisher?: string | null;
  publishedAt?: string | Date | null;
  accessedAt: string | Date;
  snippet?: string | null;
  sourceType: SourceType | string;
  origin: SourceOrigin | string;
  contactId?: string | null;
  companyId?: string | null;
  supportsClaims: string[];
};

export type ResearchClaimInput = {
  text: string;
  category: string;
  provenance: ClaimProvenance;
  confidence: number;
  contactId?: string | null;
  companyId?: string | null;
  sourceUrls?: string[];
};

export type ResearchRequest = {
  contactId: string;
  founderName: string;
  companyName: string;
  companyId?: string | null;
  query: string;
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
};

export type ResearchResult = {
  provider: "hermes" | "mock" | "hermes_cli";
  summary: string;
  sources: ResearchSourceInput[];
  claims: ResearchClaimInput[];
  unavailable: string[];
  inferred: string[];
};

export type ScoringWeights = {
  thesisMatch: number;
  stageFit: number;
  geographyFit: number;
  momentum: number;
  relationship: number;
  evidence: number;
};

export type CandidateScoreInput = {
  contactId: string;
  fullName: string;
  sector: string;
  stage: string;
  location: string;
  relationshipStrength: number;
  researchConfidence: number;
  company?: {
    sector: string;
    stage: string;
    headquarters: string;
    latestFundingDate?: string | Date | null;
    latestFundingRound?: string | null;
    latestFundingAmount?: string | null;
    checkSizeFit?: string | null;
  } | null;
  sourceCount: number;
  publicSourceCount: number;
  supportedClaimCount: number;
  citationSourceIds: string[];
};

export type CandidateScore = {
  contactId: string;
  thesisMatch: number;
  stageFit: number;
  geographyFit: number;
  momentum: number;
  relationship: number;
  evidence: number;
  overall: number;
  explanation: string;
  citations: string[];
  weights: ScoringWeights;
};

export type ReplyClassification =
  | "interested"
  | "not_interested"
  | "follow_up_later"
  | "introduction_request"
  | "wrong_person"
  | "ambiguous_human_review";
