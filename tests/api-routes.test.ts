import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { AuthenticationRequiredError } from "@/lib/api/errors";

const auth = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
const db = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));

vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/prisma", () => db);

const user = { id: "user-1", email: "partner@example.com", name: "Partner", imageUrl: null, role: "partner" };
const params = (id = "opp-1") => ({ params: Promise.resolve({ id }) });

function jsonRequest(url: string, body: unknown, method = "POST") {
  return new Request(`http://localhost${url}`, { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
}

beforeEach(() => {
  auth.requireCurrentUser.mockReset();
  auth.requireCurrentUser.mockResolvedValue(user);
  for (const key of Object.keys(db.prisma)) delete db.prisma[key];
});

describe("API input validation", () => {
  it("returns 400 for malformed JSON instead of a server error", async () => {
    const { POST } = await import("@/app/api/opportunities/route");
    const response = await POST(jsonRequest("/api/opportunities", "{not json"));

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_JSON" });
  });

  it("returns field-level details for schema violations", async () => {
    const { POST } = await import("@/app/api/opportunities/route");
    const response = await POST(jsonRequest("/api/opportunities", { company: { name: "" }, priority: "URGENT" }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("VALIDATION_ERROR");
    expect(body.details.fieldErrors).toHaveProperty("priority");
  });

  it("rejects unknown stages, missing versions and unknown fields on stage changes", async () => {
    const { POST } = await import("@/app/api/opportunities/[id]/stage/route");

    expect((await POST(jsonRequest("/x", { toStage: "WON", expectedVersion: 1 }), params())).status).toBe(400);
    expect((await POST(jsonRequest("/x", { toStage: "IC" }), params())).status).toBe(400);
    expect((await POST(jsonRequest("/x", { toStage: "IC", expectedVersion: 1, stage: "IC" }), params())).status).toBe(400);
  });

  it("requires explicit confirmation to finalize an IC memo", async () => {
    const { POST } = await import("@/app/api/memos/[id]/finalize/route");
    const response = await POST(jsonRequest("/api/memos/m1/finalize", { reviewerNotes: "ok" }), params("m1"));

    expect(response.status).toBe(400);
  });

  it("rejects invalid watchlist targets and read requests", async () => {
    const watchlist = await import("@/app/api/watchlist/route");
    const read = await import("@/app/api/watchlist/signals/read/route");

    expect((await watchlist.POST(jsonRequest("/api/watchlist", { entityType: "FUND", targetId: "x" }))).status).toBe(400);
    expect((await read.POST(jsonRequest("/api/watchlist/signals/read", {}))).status).toBe(400);
  });

  it("rejects an unknown stage filter, including prototype property names", async () => {
    const { GET } = await import("@/app/api/opportunities/route");

    expect((await GET(new Request("http://localhost/api/opportunities?stage=toString"))).status).toBe(400);
  });

  it("bounds relationship health refresh requests", async () => {
    const { POST } = await import("@/app/api/relationships/health/refresh/route");
    const tooMany = Array.from({ length: 501 }, (_, index) => `c${index}`);

    expect((await POST(jsonRequest("/api/relationships/health/refresh", { contactIds: tooMany }))).status).toBe(400);
  });
});

describe("API authentication and error mapping", () => {
  it("returns 401 when no user is signed in", async () => {
    auth.requireCurrentUser.mockRejectedValue(new AuthenticationRequiredError());
    const { GET } = await import("@/app/api/watchlist/route");
    const response = await GET();

    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("returns 404 when the opportunity does not belong to the user", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    db.prisma.opportunity = { findFirst };
    const { GET } = await import("@/app/api/opportunities/[id]/route");
    const response = await GET(new Request("http://localhost/api/opportunities/foreign"), params("foreign"));

    expect(response.status).toBe(404);
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "foreign", userId: "user-1" } }));
  });

  it("does not leak database error details", async () => {
    const error = new Prisma.PrismaClientKnownRequestError('Invalid `prisma.opportunity.findMany()` column "secret_column" does not exist', {
      code: "P2022",
      clientVersion: "test",
    });
    db.prisma.opportunity = { findMany: vi.fn().mockRejectedValue(error) };
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("@/app/api/opportunities/route");
    const response = await GET(new Request("http://localhost/api/opportunities"));
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body).toEqual({ error: "A database error occurred. Try again later.", code: "DATABASE_ERROR" });
    expect(JSON.stringify(body)).not.toContain("secret_column");
    consoleError.mockRestore();
  });
});
