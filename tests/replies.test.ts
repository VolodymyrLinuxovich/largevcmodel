import { describe, expect, it } from "vitest";
import { classifyReply } from "@/lib/domain/replies";

describe("reply classification", () => {
  it("detects positive interest", () => {
    expect(classifyReply("Happy to meet next week. The timing is good.")).toMatchObject({
      classification: "interested",
      requiresHumanReview: false,
    });
  });

  it("detects follow-up later", () => {
    expect(classifyReply("Can you follow up later, maybe in September?")).toMatchObject({
      classification: "follow_up_later",
      requiresHumanReview: false,
    });
  });

  it("flags ambiguous replies for human review", () => {
    expect(classifyReply("Interesting, I need to think about this.")).toMatchObject({
      classification: "ambiguous_human_review",
      requiresHumanReview: true,
    });
  });
});
