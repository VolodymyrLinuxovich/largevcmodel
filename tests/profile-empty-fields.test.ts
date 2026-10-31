import { describe, expect, it } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { profileSaveSchema, saveProfile } from "@/lib/profile";

/** What the settings page sends for a profile that ensureProfile just created. */
const freshProfile = {
  username: "ada",
  fullName: "Ada Lovelace",
  headline: null,
  bio: null,
  location: null,
  status: null,
  availability: null,
  avatarUrl: null,
  websiteUrl: null,
  visibility: "PUBLIC",
  messagingPermission: "EVERYONE",
  connectionPermission: "EVERYONE",
  socialLinks: null,
};

describe("profile save with empty fields", () => {
  it("accepts a new profile whose optional fields are still null", () => {
    const parsed = profileSaveSchema.safeParse({
      profile: freshProfile,
      product: { name: "Engine", stage: null, description: null, websiteUrl: null },
      project: { status: "ACTIVE", launchDate: null },
      achievement: { type: "Milestone", date: null },
    });
    expect(parsed.success).toBe(true);
  });

  it("turns a cleared field into null and leaves a missing field undefined", () => {
    const parsed = profileSaveSchema.parse({
      profile: { username: "ada", headline: "", bio: "   ", websiteUrl: "", visibility: "PUBLIC", messagingPermission: "EVERYONE", connectionPermission: "EVERYONE" },
    });
    expect(parsed.profile.headline).toBeNull();
    expect(parsed.profile.bio).toBeNull();
    expect(parsed.profile.websiteUrl).toBeNull();
    expect(parsed.profile.location).toBeUndefined();
  });

  it("still rejects an invalid URL and an overlong field", () => {
    expect(profileSaveSchema.safeParse({ profile: { username: "ada", websiteUrl: "not a url" } }).success).toBe(false);
    expect(profileSaveSchema.safeParse({ profile: { username: "ada", headline: "x".repeat(181) } }).success).toBe(false);
  });

  it("clears the stored headline when the user empties it", async () => {
    const upserts: Array<{ update: Record<string, unknown> }> = [];
    const prisma = {
      userProfile: {
        findUnique: async () => ({ userId: "user-1" }),
        upsert: async (args: { update: Record<string, unknown> }) => (upserts.push(args), args.update),
      },
    } as unknown as PrismaClient;

    const input = profileSaveSchema.parse({ profile: { ...freshProfile, headline: "", bio: "Building engines." } });
    await saveProfile(prisma, "user-1", input);

    expect(upserts[0]!.update).toMatchObject({ headline: null, bio: "Building engines.", websiteUrl: null });
  });
});
