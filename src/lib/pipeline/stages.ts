/**
 * Investment lifecycle rules. Pure and framework-free so they can be unit tested and reused by
 * both the API layer and the UI (to disable impossible moves before a request is sent).
 */

export const OPPORTUNITY_STAGES = ["SOURCED", "SCREENING", "MEETING", "DILIGENCE", "IC", "INVESTED", "PASSED"] as const;
export type OpportunityStageValue = (typeof OPPORTUNITY_STAGES)[number];

export const ACTIVE_STAGES = ["SOURCED", "SCREENING", "MEETING", "DILIGENCE", "IC"] as const satisfies readonly OpportunityStageValue[];
export const CLOSED_STAGES = ["INVESTED", "PASSED"] as const satisfies readonly OpportunityStageValue[];

export const STAGE_LABELS: Record<OpportunityStageValue, string> = {
  SOURCED: "Sourced",
  SCREENING: "Screening",
  MEETING: "Meeting",
  DILIGENCE: "Diligence",
  IC: "Investment committee",
  INVESTED: "Invested",
  PASSED: "Passed",
};

/** Stages an opportunity can be reopened into after a pass. */
const REOPEN_STAGES: readonly OpportunityStageValue[] = ["SOURCED", "SCREENING"];

export function isClosedStage(stage: OpportunityStageValue) {
  return (CLOSED_STAGES as readonly string[]).includes(stage);
}

function activeIndex(stage: OpportunityStageValue) {
  return (ACTIVE_STAGES as readonly string[]).indexOf(stage);
}

export type StageTransitionRequest = {
  from: OpportunityStageValue;
  to: OpportunityStageValue;
  note?: string | null;
  passReason?: string | null;
};

export type StageTransitionResult =
  | { ok: true; direction: "forward" | "backward" | "pass" | "invest" | "reopen" }
  | { ok: false; code: StageTransitionErrorCode; message: string };

export type StageTransitionErrorCode =
  | "SAME_STAGE"
  | "TERMINAL_STAGE"
  | "PASS_REASON_REQUIRED"
  | "NOTE_REQUIRED"
  | "IC_REQUIRED_BEFORE_INVESTMENT"
  | "INVALID_REOPEN_STAGE";

const hasText = (value?: string | null) => Boolean(value && value.trim().length >= 3);

/**
 * Transition rules:
 * - Forward moves between active stages may skip steps (a founder meeting can precede screening notes).
 * - INVESTED is reachable only from IC and is terminal.
 * - PASSED is reachable from any active stage and requires a pass reason.
 * - Backward moves between active stages and reopening a passed deal require an explanatory note.
 * - A passed deal can only be reopened into SOURCED or SCREENING.
 */
export function validateStageTransition(request: StageTransitionRequest): StageTransitionResult {
  const { from, to } = request;
  if (from === to) return { ok: false, code: "SAME_STAGE", message: `The opportunity is already in ${STAGE_LABELS[to]}.` };
  if (from === "INVESTED") {
    return { ok: false, code: "TERMINAL_STAGE", message: "Invested opportunities are closed and cannot change stage." };
  }
  if (from === "PASSED") {
    if (!REOPEN_STAGES.includes(to)) {
      return { ok: false, code: "INVALID_REOPEN_STAGE", message: "A passed opportunity can only be reopened into Sourced or Screening." };
    }
    if (!hasText(request.note)) return { ok: false, code: "NOTE_REQUIRED", message: "Explain why the opportunity is being reopened." };
    return { ok: true, direction: "reopen" };
  }
  if (to === "PASSED") {
    if (!hasText(request.passReason)) return { ok: false, code: "PASS_REASON_REQUIRED", message: "Record why the opportunity was passed." };
    return { ok: true, direction: "pass" };
  }
  if (to === "INVESTED") {
    if (from !== "IC") {
      return { ok: false, code: "IC_REQUIRED_BEFORE_INVESTMENT", message: "An opportunity must go through investment committee before it is marked invested." };
    }
    return { ok: true, direction: "invest" };
  }
  if (activeIndex(to) < activeIndex(from)) {
    if (!hasText(request.note)) return { ok: false, code: "NOTE_REQUIRED", message: "Explain why the opportunity is moving back a stage." };
    return { ok: true, direction: "backward" };
  }
  return { ok: true, direction: "forward" };
}

export function allowedNextStages(from: OpportunityStageValue): OpportunityStageValue[] {
  return OPPORTUNITY_STAGES.filter(
    (to) => validateStageTransition({ from, to, note: "placeholder", passReason: "placeholder" }).ok,
  );
}

/** Value for Opportunity.openCompanyKey: unique while open, NULL once closed. */
export function openCompanyKey(userId: string, companyId: string, stage: OpportunityStageValue) {
  return isClosedStage(stage) ? null : `${userId}:${companyId}`;
}
