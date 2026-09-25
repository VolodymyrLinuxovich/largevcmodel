import { openCompanyKey, validateStageTransition, type OpportunityStageValue, type StageTransitionResult } from "./stages";

export type StageChangeSubject = {
  id: string;
  userId: string;
  companyId: string;
  stage: OpportunityStageValue;
  passReason: string | null;
};

export type StageChangePlan =
  | { ok: false; error: Extract<StageTransitionResult, { ok: false }> }
  | {
      ok: true;
      data: {
        stage: OpportunityStageValue;
        stageChangedAt: Date;
        passReason: string | null;
        closedAt: Date | null;
        openCompanyKey: string | null;
      };
      event: { fromStage: OpportunityStageValue; toStage: OpportunityStageValue; note: string | null };
    };

/** Computes the persisted patch and history event for a stage change without touching the database. */
export function planStageChange(
  subject: StageChangeSubject,
  request: { toStage: OpportunityStageValue; note?: string | null; passReason?: string | null },
  now: Date,
): StageChangePlan {
  const result = validateStageTransition({ from: subject.stage, to: request.toStage, note: request.note, passReason: request.passReason });
  if (!result.ok) return { ok: false, error: result };

  const closing = request.toStage === "PASSED" || request.toStage === "INVESTED";
  const passReason = request.toStage === "PASSED" ? request.passReason!.trim() : result.direction === "reopen" ? null : subject.passReason;
  return {
    ok: true,
    data: {
      stage: request.toStage,
      stageChangedAt: now,
      passReason,
      closedAt: closing ? now : null,
      openCompanyKey: openCompanyKey(subject.userId, subject.companyId, request.toStage),
    },
    event: {
      fromStage: subject.stage,
      toStage: request.toStage,
      note: (request.toStage === "PASSED" ? request.passReason : request.note)?.trim() || null,
    },
  };
}
