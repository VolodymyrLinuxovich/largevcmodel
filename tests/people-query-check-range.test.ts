import { describe, expect, it } from "vitest";
import { interpretPeopleSearchObjective } from "@/lib/people/query";

describe("people search check range", () => {
  it("reads a between range in any letter case", () => {
    for (const query of ["Between $1M and $5M checks for robotics", "investors writing checks BETWEEN 250k TO 2m", "between $1M and $5M"]) {
      const interpreted = interpretPeopleSearchObjective({ query });
      expect(interpreted.checkSizeMin, query).toBeGreaterThan(0);
      expect(interpreted.checkSizeMax, query).toBeGreaterThan(interpreted.checkSizeMin!);
    }
    const interpreted = interpretPeopleSearchObjective({ query: "Between $1M and $5M checks for robotics" });
    expect(interpreted.checkSizeMin).toBe(1_000_000);
    expect(interpreted.checkSizeMax).toBe(5_000_000);
  });
});
