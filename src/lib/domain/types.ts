export type SourceType =
  | "company"
  | "news"
  | "funding"
  | "social"
  | "database"
  | "connected_account"
  | "user_provided"
  | "other";

export type SourceOrigin = "hermes" | "connected_account" | "user_provided" | "enrichment_provider";

export type ClaimProvenance = "public_research" | "connected_account" | "user_provided" | "ai_inference" | "unverified";

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
  confidence?: number | null;
  contactId?: string | null;
  companyId?: string | null;
  sourceUrls?: string[];
};

export type ResearchRequest = {
  contactId?: string | null;
  founderName?: string | null;
  companyName?: string | null;
  companyId?: string | null;
  query: string;
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
};

export type ResearchResult = {
  provider: "hermes" | "hermes_cli";
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
  contactId?: string | null;
  companyId?: string | null;
  fullName?: string | null;
  organization?: string | null;
  title?: string | null;
  sector?: string | null;
  stage?: string | null;
  geography?: string | null;
  relationshipStrength?: number | null;
  interactionCount?: number | null;
  lastInteractionAt?: string | Date | null;
  sourceCount: number;
  supportedClaimCount: number;
  thesis?: {
    targetSectors: string[];
    stages: string[];
    geographies: string[];
    customCriteria?: unknown;
  } | null;
};

export type CandidateScore = {
  contactId?: string | null;
  companyId?: string | null;
  thesisMatch: number;
  stageFit: number;
  geographyFit: number;
  momentum: number;
  relationship: number;
  evidence: number;
  overall: number;
  confidence: number;
  explanation: string;
  missingInfo: string[];
  weights: ScoringWeights;
};

export type ReplyClassification =
  | "interested"
  | "not_interested"
  | "follow_up_later"
  | "introduction_request"
  | "wrong_person"
  | "ambiguous_human_review";
