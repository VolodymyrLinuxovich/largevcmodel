import { describe, expect, it } from "vitest";
import { classifyReply } from "@/lib/domain/replies";

describe("reply classification", () => {
  it("detects positive interest", () => {
    expect(classifyReply("Happy to meet next week. The timing is good.")).toMatchObject({
      classification: "interested",
      requiresHumanReview: false,
    });
  });

  it("does not read a declined reply as interest", () => {
    expect(classifyReply("Thanks, but we are not interested right now.")).toMatchObject({
      classification: "not_interested",
      requiresHumanReview: false,
    });
    expect(classifyReply("We will pass on this round, no need to schedule a call.").classification).toBe("not_interested");
  });

  it("does not treat words containing pass as a decline", () => {
    expect(classifyReply("Our team is passionate about this, happy to meet next week.").classification).toBe("interested");
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
