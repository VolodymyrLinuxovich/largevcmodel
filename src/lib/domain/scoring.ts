import type { CandidateScore, CandidateScoreInput, ScoringWeights } from "./types";

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

function tokenMatch(value: string | null | undefined, targets: string[] | undefined) {
  if (!targets?.length) return null;
  const normalized = value?.toLowerCase() ?? "";
  if (!normalized) return 0;
  return targets.some((target) => normalized.includes(target.toLowerCase()) || target.toLowerCase().includes(normalized))
    ? 92
    : 35;
}

export function calculateFitScore(input: CandidateScoreInput, rawWeights: ScoringWeights = DEFAULT_SCORING_WEIGHTS): CandidateScore {
  const weights = normalizeWeights(rawWeights);
  const missingInfo: string[] = [];

  const thesisMatch = tokenMatch(input.sector ?? input.organization, input.thesis?.targetSectors);
  if (thesisMatch === null) missingInfo.push("No active thesis sectors configured.");
  if (!input.sector && !input.organization) missingInfo.push("No sector or organization evidence is available.");

  const stageFit = tokenMatch(input.stage, input.thesis?.stages);
  if (stageFit === null) missingInfo.push("No target investment stages configured.");
  if (!input.stage) missingInfo.push("Company stage is unavailable.");

  const geographyFit = tokenMatch(input.geography, input.thesis?.geographies);
  if (geographyFit === null) missingInfo.push("No target geographies configured.");
  if (!input.geography) missingInfo.push("Geography is unavailable.");

  const lastInteractionAt = input.lastInteractionAt ? new Date(input.lastInteractionAt) : null;
  const daysSinceInteraction = lastInteractionAt
    ? Math.max(0, (Date.now() - lastInteractionAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;
  const momentum =
    daysSinceInteraction === null
      ? input.supportedClaimCount > 0
        ? 55
        : 20
      : daysSinceInteraction <= 14
        ? 88
        : daysSinceInteraction <= 90
          ? 72
          : 42;

  const relationship = Math.min(
    100,
    Math.max(0, (input.relationshipStrength ?? 0) * 10 + Math.min(30, (input.interactionCount ?? 0) * 3)),
  );
  const evidence = Math.min(100, input.sourceCount * 18 + input.supportedClaimCount * 10);

  const criteria = {
    thesisMatch: thesisMatch ?? 0,
    stageFit: stageFit ?? 0,
    geographyFit: geographyFit ?? 0,
    momentum,
    relationship,
    evidence,
  };

  const overall = Math.round(
    (criteria.thesisMatch * weights.thesisMatch +
      criteria.stageFit * weights.stageFit +
      criteria.geographyFit * weights.geographyFit +
      criteria.momentum * weights.momentum +
      criteria.relationship * weights.relationship +
      criteria.evidence * weights.evidence) /
      100,
  );

  const confidence = Math.min(95, Math.max(10, Math.round((evidence + relationship + (100 - missingInfo.length * 12)) / 3)));
  const explanation =
    missingInfo.length > 0
      ? "This score is incomplete because key thesis or evidence fields are unavailable."
      : "This score prioritizes the contact against the saved thesis using connected-account signals and sourced research evidence.";

  return {
    contactId: input.contactId,
    companyId: input.companyId,
    thesisMatch: criteria.thesisMatch,
    stageFit: criteria.stageFit,
    geographyFit: criteria.geographyFit,
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
