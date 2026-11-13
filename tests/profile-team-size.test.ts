import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { profileSaveSchema, saveProfile } from "@/lib/profile";

const profile = { username: "ada", visibility: "PUBLIC", messagingPermission: "EVERYONE", connectionPermission: "EVERYONE" };

async function savedTeamSize(teamSize: unknown) {
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
  const input = profileSaveSchema.parse({ profile, product: { id: "product-1", name: "Engine", teamSize } });
  await saveProfile(prisma, "user-1", input);
  return updates[0]!.teamSize;
}

describe("product team size", () => {
  it("clears the stored team size when the field is emptied", async () => {
    expect(await savedTeamSize(null)).toBeNull();
    expect(await savedTeamSize("")).toBeNull();
  });

  it("keeps a team size of zero", async () => {
    expect(await savedTeamSize(0)).toBe(0);
    expect(await savedTeamSize("0")).toBe(0);
  });

  it("saves a number and leaves a missing field untouched", async () => {
    expect(await savedTeamSize(12)).toBe(12);
    expect(await savedTeamSize(undefined)).toBeUndefined();
  });

  it("rejects a negative or fractional size", () => {
    expect(profileSaveSchema.safeParse({ profile, product: { name: "Engine", teamSize: -1 } }).success).toBe(false);
    expect(profileSaveSchema.safeParse({ profile, product: { name: "Engine", teamSize: 2.5 } }).success).toBe(false);
  });
});
