import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { extractStartupFields, mergePitchDeckExtraction } from "@/lib/startups/pitch-deck";

async function mergeField(fieldKey: string, extractedValue: string, edit?: string) {
  const startupUpdate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data);
  const prisma = {
    pitchDeckExtraction: {
      findFirst: vi.fn().mockResolvedValue({
        id: "extraction-1",
        startupId: "startup-1",
        pitchDeckId: "deck-1",
        startup: { id: "startup-1", name: "Atlas Robotics" },
        fields: [{ id: "field-1", fieldKey, extractedValue }],
      }),
      update: vi.fn(),
    },
    pitchDeckExtractionField: { update: vi.fn() },
    startupProfile: { update: startupUpdate },
    pitchDeck: { update: vi.fn() },
  } as unknown as PrismaClient;

  await mergePitchDeckExtraction(prisma, "user-1", "startup-1", {
    extractionId: "extraction-1",
    fields: [{ fieldId: "field-1", action: edit === undefined ? "accept" : "edit", value: edit }],
  });
  return startupUpdate.mock.calls[0][0].data[fieldKey];
}

describe("pitch deck extraction merge", () => {
  it("keeps the unit of an accepted funding target", async () => {
    const field = extractStartupFields("Raising: $3M to scale pilots across Europe").find((item) => item.fieldKey === "fundingTarget");

    expect(field?.extractedValue).toBe("$3M to scale pilots across Europe");
    await expect(mergeField("fundingTarget", field?.extractedValue ?? "")).resolves.toBe(3_000_000);
  });

  it.each([
    ["$2.5M", 2_500_000],
    ["$500K", 500_000],
    ["$1,500,000", 1_500_000],
    ["1.5M - 3M", 1_500_000],
    ["3000000", 3_000_000],
  ])("parses edited amount %s", async (value, expected) => {
    await expect(mergeField("fundingTarget", "", value)).resolves.toBe(expected);
  });

  it("does not read units out of ordinary words", async () => {
    await expect(mergeField("customerCount", "", "12 customers in 18 months")).resolves.toBe(12);
  });

  it("returns null instead of overflowing the integer column", async () => {
    await expect(mergeField("fundingTarget", "", "$5B")).resolves.toBeNull();
    await expect(mergeField("fundingTarget", "", "not disclosed")).resolves.toBeNull();
  });
});
