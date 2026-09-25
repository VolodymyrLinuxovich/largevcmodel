import { phraseMatch } from "./text-match";
import type { CandidateScore, CandidateScoreInput, ScoringCriterion, ScoringWeights } from "./types";

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  thesisMatch: 30,
  stageFit: 20,
  geographyFit: 15,
  momentum: 15,
  relationship: 10,
  evidence: 10,
};

export function normalizeWeights(weights: ScoringWeights = DEFAULT_SCORING_WEIGHTS): ScoringWeights {
  const total = Object.values(weights).reduce((sum, value) => sum + value, 0);
  if (total === 100) return weights;
  if (total <= 0) return DEFAULT_SCORING_WEIGHTS;

  const thesisMatch = Math.round((weights.thesisMatch / total) * 100);
  const stageFit = Math.round((weights.stageFit / total) * 100);
  const geographyFit = Math.round((weights.geographyFit / total) * 100);
  const momentum = Math.round((weights.momentum / total) * 100);
  const relationship = Math.round((weights.relationship / total) * 100);
  return {
    thesisMatch,
    stageFit,
    geographyFit,
    momentum,
    relationship,
    evidence: Math.max(0, 100 - thesisMatch - stageFit - geographyFit - momentum - relationship),
  };
}

/** null when either side is unknown: missing data is excluded from the score, not scored as a mismatch. */
function thesisCriterion(value: string | null | undefined, targets: string[] | undefined): number | null {
  if (!targets?.length || !value?.trim()) return null;
  return targets.some((target) => phraseMatch(value, target)) ? 92 : 35;
}

export function calculateFitScore(input: CandidateScoreInput, rawWeights: ScoringWeights = DEFAULT_SCORING_WEIGHTS): CandidateScore {
  const weights = normalizeWeights(rawWeights);
  const missingInfo: string[] = [];

  if (!input.thesis?.targetSectors?.length) missingInfo.push("No active thesis sectors configured.");
  if (!input.sector && !input.organization) missingInfo.push("No sector or organization evidence is available.");
  const thesisMatch = thesisCriterion(input.sector ?? input.organization, input.thesis?.targetSectors);

  if (!input.thesis?.stages?.length) missingInfo.push("No target investment stages configured.");
  if (!input.stage) missingInfo.push("Company stage is unavailable.");
  const stageFit = thesisCriterion(input.stage, input.thesis?.stages);

  if (!input.thesis?.geographies?.length) missingInfo.push("No target geographies configured.");
  if (!input.geography) missingInfo.push("Geography is unavailable.");
  const geographyFit = thesisCriterion(input.geography, input.thesis?.geographies);

  const lastInteractionAt = input.lastInteractionAt ? new Date(input.lastInteractionAt) : null;
  const daysSinceInteraction = lastInteractionAt
    ? Math.max(0, (Date.now() - lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const momentum =
    daysSinceInteraction === null
      ? input.supportedClaimCount > 0
        ? 55
        : null
      : daysSinceInteraction <= 14
        ? 88
        : daysSinceInteraction <= 90
          ? 72
          : 42;
  if (momentum === null) missingInfo.push("No interaction or sourced activity is available to assess momentum.");

  // relationshipStrength is persisted on a 0-100 scale (see recalculateRelationshipStrength and
  // relationship health). It was previously multiplied by 10, which saturated this criterion.
  const relationship =
    input.relationshipStrength === null || input.relationshipStrength === undefined
      ? null
      : Math.min(100, Math.round(Math.min(100, Math.max(0, input.relationshipStrength)) * 0.7 + Math.min(30, (input.interactionCount ?? 0) * 3)));
  if (relationship === null) missingInfo.push("No assessed relationship is available.");
  const evidence = Math.min(100, input.sourceCount * 18 + input.supportedClaimCount * 10);

  const criteria: Record<keyof ScoringWeights, ScoringCriterion> = { thesisMatch, stageFit, geographyFit, momentum, relationship, evidence };
  const available = (Object.keys(criteria) as Array<keyof ScoringWeights>).filter((key) => criteria[key] !== null);
  const availableWeight = available.reduce((sum, key) => sum + weights[key], 0);
  // Unavailable criteria are excluded and the remaining weights renormalized, as in relationship health.
  const overall = availableWeight
    ? Math.round(available.reduce((sum, key) => sum + (criteria[key] as number) * weights[key], 0) / availableWeight)
    : 0;

  const coverage = availableWeight / 100;
  const confidence = Math.min(95, Math.max(10, Math.round(((evidence + (relationship ?? 0)) / 2) * 0.5 + coverage * 50 - missingInfo.length * 3)));
  const explanation =
    missingInfo.length > 0
      ? `This score is incomplete: ${6 - available.length} of 6 criteria were unavailable and excluded; the remaining weights were renormalized.`
      : "This score prioritizes the candidate against the saved thesis using connected-account signals and sourced research evidence.";

  return {
    contactId: input.contactId,
    companyId: input.companyId,
    thesisMatch,
    stageFit,
    geographyFit,
    momentum,
    relationship,
    evidence,
    overall,
    confidence,
    explanation,
    missingInfo,
    weights,
  };
}
