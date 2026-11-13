import { describe, expect, it } from "vitest";
import { parseNetworkObjective } from "@/lib/domain/network-search";

const now = new Date("2026-07-23T00:00:00.000Z");
const stages = (query: string) => parseNetworkObjective({ query, strictness: "balanced" }, now).fundingStages;

describe("network search funding stage", () => {
  it("reads pre-seed without adding seed", () => {
    expect(stages("pre-seed founders in Berlin")).toEqual(["pre-seed"]);
    expect(stages("pre seed founders")).toEqual(["pre-seed"]);
    expect(stages("preseed founders")).toEqual(["pre-seed"]);
  });

  it("keeps both when both are asked for", () => {
    expect(stages("pre-seed or seed founders")).toEqual(["pre-seed", "seed"]);
  });

  it("reads seed and series A as whole words", () => {
    expect(stages("seed stage founders")).toEqual(["seed"]);
    expect(stages("founders seeding new ideas")).toEqual([]);
    expect(stages("series a founders")).toEqual(["series A"]);
    expect(stages("series about founders")).toEqual([]);
  });
});
