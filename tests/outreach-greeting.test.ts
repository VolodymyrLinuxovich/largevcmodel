import { describe, expect, it } from "vitest";
import { generateOutreachDraft } from "@/lib/domain/outreach";

function greeting(fullName: string | null, primaryEmail: string | null = null) {
  const draft = generateOutreachDraft({ fullName, primaryEmail, organization: null, title: null }, []);
  return draft.body.split("\n")[0];
}

describe("outreach greeting", () => {
  it("skips a leading title", () => {
    expect(greeting("Dr. Jane Smith")).toBe("Hi Jane,");
    expect(greeting("Prof Alan Turing")).toBe("Hi Alan,");
    expect(greeting("Ms. Ada Lovelace")).toBe("Hi Ada,");
  });

  it("uses the first word of a plain name", () => {
    expect(greeting("Jane Smith")).toBe("Hi Jane,");
    expect(greeting("  Jane   Smith ")).toBe("Hi Jane,");
  });

  it("keeps a lone title rather than an empty name", () => {
    expect(greeting("Dr.")).toBe("Hi Dr.,");
  });

  it("falls back to there for an email", () => {
    expect(greeting(null, "jane@example.com")).toBe("Hi there,");
  });
});
