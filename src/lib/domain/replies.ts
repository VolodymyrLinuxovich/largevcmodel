import type { ReplyClassification } from "./types";

export function classifyReply(body: string): { classification: ReplyClassification; confidence: number; requiresHumanReview: boolean } {
  const normalized = body.toLowerCase();

  if (/(happy to|timing is good|would be happy|let'?s meet|schedule|next week|interested)/.test(normalized)) {
    return { classification: "interested", confidence: 91, requiresHumanReview: false };
  }
  if (/(not interested|not taking|pass|no thanks|not a fit)/.test(normalized)) {
    return { classification: "not_interested", confidence: 88, requiresHumanReview: false };
  }
  if (/(check back|follow up|later|september|next quarter|after launch)/.test(normalized)) {
    return { classification: "follow_up_later", confidence: 84, requiresHumanReview: false };
  }
  if (/(intro|introduce|include|warm|connect me|loop in)/.test(normalized)) {
    return { classification: "introduction_request", confidence: 82, requiresHumanReview: false };
  }
  if (/(wrong person|not the right person|contact our ceo|talk to)/.test(normalized)) {
    return { classification: "wrong_person", confidence: 86, requiresHumanReview: false };
  }

  return { classification: "ambiguous_human_review", confidence: 57, requiresHumanReview: true };
}
