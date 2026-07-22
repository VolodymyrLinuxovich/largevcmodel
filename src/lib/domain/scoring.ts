import type { CandidateScore, CandidateScoreInput, ScoringWeights } from "./types";

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  thesisMatch: 30,
  stageFit: 20,
  geographyFit: 15,
  momentum: 15,
  relationship: 10,
  evidence: 10,
};

const targetSectors = ["AI Infrastructure", "Developer Tools", "Data Infrastructure", "AI Security", "Model Observability"];
const bayAreaTokens = ["san francisco", "oakland", "berkeley", "palo alto", "san mateo", "mountain view", "san jose"];

export function normalizeWeights(weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS): ScoringWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 100) return weights;
  if (total <= 0) return DEFAULT_SCORING_WEIGHTS;
  return {
    thesisMatch: Math.round((weights.thesisMatch / total) * 100),
    stageFit: Math.round((weights.stageFit / total) * 100),
    geographyFit: Math.round((weights.geographyFit / total) * 100),
    momentum: Math.round((weights.momentum / total) * 100),
    relationship: Math.round((weights.relationship / total) * 100),
    evidence: Math.max(
      0,
      100 -
        Math.round((weights.thesisMatch / total) * 100) -
        Math.round((weights.stageFit / total) * 100) -
        Math.round((weights.geographyFit / total) * 100) -
        Math.round((weights.momentum / total) * 100) -
        Math.round((weights.relationship / total) * 100),
    ),
  };
}

export function calculateFitScore(input: CandidateScoreInput, rawWeights: ScoringWeights = DEFAULT_SCORING_WEIGHTS): CandidateScore {
  const weights = normalizeWeights(rawWeights);
  const sector = input.company?.sector ?? input.sector;
  const stage = input.company?.stage ?? input.stage;
  const location = `${input.location} ${input.company?.headquarters ?? ""}`.toLowerCase();
  const fundingDate = input.company?.latestFundingDate ? new Date(input.company.latestFundingDate) : null;
  const monthsSinceFunding = fundingDate
    ? Math.max(0, (new Date("2026-07-22T00:00:00.000Z").getTime() - fundingDate.getTime()) / (1000 * 60 * 60 * 24 * 30))
    : null;

  const thesisMatch = targetSectors.includes(sector)
    ? sector === "AI Infrastructure"
      ? 96
      : 88
    : sector.includes("AI")
      ? 62
      : 45;
  const stageFit = stage === "Seed" ? 94 : stage === "Pre-seed" ? 78 : stage === "Series A" ? 48 : 55;
  const geographyFit = bayAreaTokens.some((token) => location.includes(token)) ? 95 : 40;
  const momentum =
    monthsSinceFunding === null ? 42 : monthsSinceFunding <= 2 ? 96 : monthsSinceFunding <= 6 ? 88 : monthsSinceFunding <= 10 ? 70 : 48;
  const relationship = Math.min(100, Math.max(0, input.relationshipStrength * 10 + 8));
  const evidence = Math.min(100, 40 + input.publicSourceCount * 14 + input.supportedClaimCount * 4 + Math.round(input.researchConfidence / 10));

  const overall = Math.round(
    (thesisMatch * weights.thesisMatch +
      stageFit * weights.stageFit +
      geographyFit * weights.geographyFit +
      momentum * weights.momentum +
      relationship * weights.relationship +
      evidence * weights.evidence) /
      100,
  );

  const citations = input.citationSourceIds.slice(0, 3);
  const explanation = `${input.fullName} ranks highly because ${sector.toLowerCase()} matches the technical AI infrastructure thesis, ${stage.toLowerCase()} timing fits the fund model, and the available evidence supports momentum without treating the score as an objective judgment.`;

  return {
    contactId: input.contactId,
    thesisMatch,
    stageFit,
    geographyFit,
    momentum,
    relationship,
    evidence,
    overall,
    explanation,
    citations,
    weights,
  };
}
