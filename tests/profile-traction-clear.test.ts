import { describe, expect, it } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";
import { profileSaveSchema, saveProfile } from "@/lib/profile";

const profile = { username: "ada", visibility: "PUBLIC", messagingPermission: "EVERYONE", connectionPermission: "EVERYONE" };

async function savedTraction(tractionMetric: unknown) {
  const updates: Array<Record<string, unknown>> = [];
  const prisma = {
    userProfile: {
      findUnique: async () => ({ userId: "user-1" }),
      upsert: async (args: { update: Record<string, unknown> }) => args.update,
    },
    product: {
      updateMany: async (args: { data: Record<string, unknown> }) => (updates.push(args.data), { count: 1 }),
    },
  } as unknown as PrismaClient;
  const input = profileSaveSchema.parse({ profile, product: { id: "product-1", name: "Engine", tractionMetric } });
  await saveProfile(prisma, "user-1", input);
  return updates[0]!.tractionMetrics;
}

describe("product traction metric", () => {
  it("clears the stored traction when the field is emptied", async () => {
    expect(await savedTraction("")).toBe(Prisma.DbNull);
    expect(await savedTraction("   ")).toBe(Prisma.DbNull);
    expect(await savedTraction(null)).toBe(Prisma.DbNull);
  });

  it("saves typed traction as unverified and leaves a missing field untouched", async () => {
    expect(await savedTraction("40 paying teams")).toEqual({ selfReported: "40 paying teams", verification: "unverified self-reported" });
    expect(await savedTraction(undefined)).toBeUndefined();
  });
});
