import { describe, expect, it } from "vitest";
import { type PrismaClient, PersonType } from "@prisma/client";
import { saveStartupProfile, startupProfileInputSchema } from "@/lib/startups/profile";
import { interpretPeopleSearchObjective } from "@/lib/people/query";
import { searchOnlyStartupContext } from "@/lib/people/search";
import { peopleSearchRequestSchema } from "@/lib/people/types";

describe("startup profile save flow", () => {
  it("saves only a company name", async () => {
    const saved = await saveWithInput({ name: "Atlas Robotics" });

    expect(saved.data).toMatchObject({
      userId: "user",
      name: "Atlas Robotics",
      website: null,
      logoUrl: null,
      fundingTarget: null,
      keywords: [],
      technologies: [],
    });
  });

  it("saves a complete profile and prepends https to URL fields", async () => {
    const saved = await saveWithInput({
      name: "Atlas Robotics",
      website: "atlas.example",
      logoUrl: "assets.example/logo.png",
      oneLineDescription: "Autonomy software for field robotics",
      industry: "Robotics",
      subIndustries: "autonomy, geospatial intelligence",
      fundingTarget: "1500000",
      minCheckSize: "250000",
      maxCheckSize: "2000000",
      customerCount: "12",
      technologies: "robotics, autonomy",
    });

    expect(saved.data.website).toBe("https://atlas.example");
    expect(saved.data.logoUrl).toBe("https://assets.example/logo.png");
    expect(saved.data.subIndustries).toEqual(["autonomy", "geospatial intelligence"]);
    expect(saved.data.fundingTarget).toBe(1_500_000);
    expect(saved.data.customerCount).toBe(12);
  });

  it("accepts a blank website", () => {
    const parsed = startupProfileInputSchema.parse({ name: "Atlas Robotics", website: "", logoUrl: "" });

    expect(parsed.website).toBeNull();
    expect(parsed.logoUrl).toBeNull();
  });

  it("returns a field-level URL error only when a URL field contains an invalid value", () => {
    const parsed = startupProfileInputSchema.safeParse({ name: "Atlas Robotics", website: "http://not a url" });

    expect(parsed.success).toBe(false);
    if (!parsed.success) {
      const fieldErrors = parsed.error.flatten().fieldErrors as Record<string, string[] | undefined>;
      expect(fieldErrors.website?.[0]).toBe("Enter a valid URL.");
    }
  });

  it("allows clearing existing optional fields", async () => {
    const saved = await saveWithInput({
      id: "startup",
      name: "Atlas Robotics",
      website: "",
      oneLineDescription: "",
      industry: "",
      technologies: "",
      fundingTarget: "",
    });

    expect(saved.data.website).toBeNull();
    expect(saved.data.oneLineDescription).toBeNull();
    expect(saved.data.industry).toBeNull();
    expect(saved.data.technologies).toEqual([]);
    expect(saved.data.fundingTarget).toBeNull();
  });

  it("converts empty numeric fields to null", () => {
    const parsed = startupProfileInputSchema.parse({
      name: "Atlas Robotics",
      fundingTarget: "",
      minCheckSize: "",
      maxCheckSize: "",
      customerCount: "",
    });

    expect(parsed.fundingTarget).toBeNull();
    expect(parsed.minCheckSize).toBeNull();
    expect(parsed.maxCheckSize).toBeNull();
    expect(parsed.customerCount).toBeNull();
  });

  it("converts empty array inputs to empty arrays", () => {
    const parsed = startupProfileInputSchema.parse({
      name: "Atlas Robotics",
      subIndustries: "",
      keywords: [],
      technologies: " , ",
    });

    expect(parsed.subIndustries).toEqual([]);
    expect(parsed.keywords).toEqual([]);
    expect(parsed.technologies).toEqual([]);
  });
});

describe("people search without completed startup context", () => {
  it("accepts investor search without a startup profile", () => {
    const parsed = peopleSearchRequestSchema.safeParse({
      query: "Find seed investors in Europe interested in robotics",
      filters: { personTypes: [PersonType.INVESTOR] },
      limit: 12,
      offset: 0,
    });

    expect(parsed.success).toBe(true);
  });

  it("accepts investor search without a pitch deck", () => {
    const parsed = peopleSearchRequestSchema.parse({
      query: "Find investors who write checks between $250k and $2M",
      filters: {},
    });
    const interpreted = interpretPeopleSearchObjective({ query: parsed.query, filters: parsed.filters });
    const context = searchOnlyStartupContext("user", parsed, interpreted);

    expect(context.id).toBe("search-context");
    expect(context.minCheckSize).toBe(250_000);
    expect(context.maxCheckSize).toBe(2_000_000);
  });

  it("searches using only a plain-language query", () => {
    const parsed = peopleSearchRequestSchema.parse({ query: "Find strategic partners for climate-risk analytics" });
    const interpreted = interpretPeopleSearchObjective({ query: parsed.query, filters: parsed.filters });
    const context = searchOnlyStartupContext("user", parsed, interpreted);

    expect(context.oneLineDescription).toBe("Find strategic partners for climate-risk analytics");
    expect(interpreted.personTypes).toContain(PersonType.STRATEGIC_PARTNER);
  });
});

async function saveWithInput(input: Record<string, unknown>) {
  const data = startupProfileInputSchema.parse(input);
  const calls: Array<{ method: "create" | "update"; data: Record<string, unknown> }> = [];
  const prisma = {
    startupProfile: {
      findFirst: async () => ({ id: data.id ?? "startup" }),
      create: async ({ data: createData }: { data: Record<string, unknown> }) => {
        calls.push({ method: "create", data: createData });
        return { id: "startup", ...createData };
      },
      update: async ({ data: updateData }: { data: Record<string, unknown> }) => {
        calls.push({ method: "update", data: updateData });
        return { id: data.id ?? "startup", ...updateData };
      },
    },
  } as unknown as PrismaClient;

  await saveStartupProfile(prisma, "user", data);
  return calls[0];
}
