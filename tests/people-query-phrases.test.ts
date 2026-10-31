import { describe, expect, it } from "vitest";
import { interpretPeopleSearchObjective } from "@/lib/people/query";

describe("people search query phrases", () => {
  it("reads lead phrases only as whole words", () => {
    const focusing = interpretPeopleSearchObjective({ query: "investors focusing on robotics" });
    expect(focusing.technologyKeywords).not.toContain("on robotics");

    const housing = interpretPeopleSearchObjective({ query: "angels backing housing startups" });
    expect(housing.technologyKeywords).not.toContain("startups");

    const workingOn = interpretPeopleSearchObjective({ query: "founders working on robotics" });
    expect(workingOn.technologyKeywords).toContain("robotics");
  });
});
