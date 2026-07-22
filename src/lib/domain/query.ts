import { z } from "zod";
import type { ScoringWeights } from "./types";
import { DEFAULT_SCORING_WEIGHTS } from "./scoring";

export const queryRequestSchema = z.object({
  query: z.string().min(8),
  filters: z
    .object({
      stage: z.string().optional(),
      sector: z.string().optional(),
      geography: z.string().optional(),
      fundingDate: z.string().optional(),
      checkSize: z.string().optional(),
      relationshipStrength: z.string().optional(),
    })
    .optional(),
  weights: z
    .object({
      thesisMatch: z.number().min(0).max(100),
      stageFit: z.number().min(0).max(100),
      geographyFit: z.number().min(0).max(100),
      momentum: z.number().min(0).max(100),
      relationship: z.number().min(0).max(100),
      evidence: z.number().min(0).max(100),
    })
    .optional(),
});

export type StructuredIntent = {
  objective: string;
  sectors: string[];
  stages: string[];
  geographies: string[];
  fundingWindow: string;
  checkSize: string;
  relationshipPreference: string;
};

export function parsePartnerIntent(query: string, filters?: Record<string, string | undefined>): StructuredIntent {
  const lower = query.toLowerCase();
  const sectors = lower.includes("infrastructure") || lower.includes("infra")
    ? ["AI Infrastructure", "Model Observability", "Data Infrastructure", "AI Security", "Developer Tools"]
    : filters?.sector
      ? [filters.sector]
      : ["AI Infrastructure"];

  const stages = lower.includes("seed")
    ? ["Seed", "Pre-seed"]
    : filters?.stage
      ? [filters.stage]
      : ["Seed"];

  const geographies = lower.includes("bay area") || lower.includes("san francisco")
    ? ["San Francisco", "Oakland", "Berkeley", "Palo Alto", "San Mateo", "Mountain View", "San Jose"]
    : filters?.geography
      ? [filters.geography]
      : ["Bay Area"];

  return {
    objective: query,
    sectors,
    stages,
    geographies,
    fundingWindow: lower.includes("recent") ? "last 9 months" : filters?.fundingDate ?? "last 12 months",
    checkSize: filters?.checkSize ?? "$500K-$2.5M",
    relationshipPreference: filters?.relationshipStrength ?? "Prefer warm first or second degree paths",
  };
}

export function weightsOrDefault(weights?: ScoringWeights) {
  return weights ?? DEFAULT_SCORING_WEIGHTS;
}
