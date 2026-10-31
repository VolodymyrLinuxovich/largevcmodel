import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { ensureProfile, normalizeUsername, usernameWithSuffix } from "@/lib/profile";

function prismaWithTaken(taken: Set<string>) {
  const create = vi.fn(async ({ data }: { data: { username: string } }) => data);
  const prisma = {
    userProfile: {
      findUnique: vi.fn(async ({ where }: { where: { userId?: string; username?: string } }) => {
        if (where.userId) return null;
        return where.username && taken.has(where.username) ? { userId: "someone-else" } : null;
      }),
      create,
    },
  } as unknown as PrismaClient;
  return { prisma, create };
}

describe("ensureProfile username", () => {
  it("keeps the suffix when the email name is 32 characters or longer", async () => {
    const local = "a".repeat(40);
    const base = normalizeUsername(local);
    const { prisma, create } = prismaWithTaken(new Set([base, usernameWithSuffix(base, 2)]));

    await ensureProfile(prisma, { id: "user-123456789", email: `${local}@example.com`, name: null });

    const username = create.mock.calls[0][0].data.username;
    expect(username).toBe(`${"a".repeat(30)}-3`);
    expect(username.length).toBeLessThanOrEqual(32);
  });

  it("falls back to a user id stem when the email name has no usable characters", async () => {
    const { prisma, create } = prismaWithTaken(new Set(["user-abcdefgh"]));

    await ensureProfile(prisma, { id: "abcdefgh-1234", email: "...@example.com", name: null });

    expect(create.mock.calls[0][0].data.username).toBe("user-abcdefgh-2");
  });

  it("does not leave a dash before the suffix when the cut lands on one", () => {
    expect(usernameWithSuffix(`${"a".repeat(29)}-bbb`, 2)).toBe(`${"a".repeat(29)}-2`);
  });
});
