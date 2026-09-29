import { IntegrationStatus, type PrismaClient } from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { revokeIntegration } from "@/lib/google/api";
import { encryptSecret } from "@/lib/security/encryption";

type Row = {
  id: string;
  userId: string;
  provider: string;
  status: IntegrationStatus;
  accessTokenCiphertext: string | null;
  refreshTokenCiphertext: string | null;
};

function fakePrisma(rows: Row[]) {
  const matches = (row: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([key, value]) => {
      const actual = row[key as keyof Row];
      if (value && typeof value === "object" && "not" in value) return actual !== (value as { not: unknown }).not;
      return actual === value;
    });
  return {
    integration: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => rows.find((row) => matches(row, where)) ?? null),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<Row> }) => {
        const hit = rows.filter((row) => matches(row, where));
        hit.forEach((row) => Object.assign(row, data));
        return { count: hit.length };
      }),
    },
  } as unknown as PrismaClient;
}

function signInRows(): Row[] {
  const token = encryptSecret("shared-refresh-token");
  return ["contacts", "gmail", "calendar"].map((id) => ({
    id,
    userId: "user-1",
    provider: "google",
    status: IntegrationStatus.CONNECTED,
    accessTokenCiphertext: token,
    refreshTokenCiphertext: token,
  }));
}

describe("revokeIntegration", () => {
  beforeEach(() => {
    vi.stubEnv("TOKEN_ENCRYPTION_KEY", Buffer.alloc(32, 7).toString("base64"));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("marks every Google integration sharing the revoked grant as revoked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 200 })));
    const rows = signInRows();

    await revokeIntegration(fakePrisma(rows), "user-1", "gmail");

    expect(rows.map((row) => row.status)).toEqual([IntegrationStatus.REVOKED, IntegrationStatus.REVOKED, IntegrationStatus.REVOKED]);
    expect(rows.every((row) => row.accessTokenCiphertext === null && row.refreshTokenCiphertext === null)).toBe(true);
  });

  it("still clears local tokens when Google reports the grant is already revoked", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('{"error":"invalid_token"}', { status: 400 })));
    const rows = signInRows();

    await expect(revokeIntegration(fakePrisma(rows), "user-1", "contacts")).resolves.toBeUndefined();

    expect(rows.every((row) => row.status === IntegrationStatus.REVOKED && row.refreshTokenCiphertext === null)).toBe(true);
  });

  it("keeps other failures visible and leaves tokens in place", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 })));
    const rows = signInRows();

    await expect(revokeIntegration(fakePrisma(rows), "user-1", "gmail")).rejects.toThrow("503");
    expect(rows.every((row) => row.status === IntegrationStatus.CONNECTED)).toBe(true);
  });
});
