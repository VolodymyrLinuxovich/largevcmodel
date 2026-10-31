import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
const db = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));

vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/prisma", () => db);

const user = { id: "user-1", email: "partner@example.com", name: "Partner", imageUrl: null, role: "partner" };

/** findFirst that only returns rows owned by user-1, like a userId-scoped query would. */
function ownedBy(ids: string[]) {
  return vi.fn(async ({ where }: { where: { id: string; userId: string } }) =>
    where.userId === "user-1" && ids.includes(where.id) ? { id: where.id } : null,
  );
}

const listUpsert = vi.fn();
const savedUpsert = vi.fn();

beforeEach(() => {
  auth.requireCurrentUser.mockReset();
  auth.requireCurrentUser.mockResolvedValue(user);
  listUpsert.mockReset().mockResolvedValue({ id: "list-1" });
  savedUpsert.mockReset().mockResolvedValue({ id: "saved-1" });
  for (const key of Object.keys(db.prisma)) delete db.prisma[key];
  Object.assign(db.prisma, {
    discoveredPerson: { findFirst: vi.fn().mockResolvedValue({ id: "person-1", fullName: "Dana Lee" }) },
    startupProfile: { findFirst: ownedBy(["startup-1"]) },
    peopleSearchRun: { findFirst: ownedBy(["run-1"]) },
    peopleSearchResult: { findFirst: ownedBy(["result-1"]) },
    savedPeopleList: { upsert: listUpsert, findFirst: vi.fn() },
    savedPerson: { upsert: savedUpsert },
    auditEvent: { create: vi.fn().mockResolvedValue({}) },
  });
});

async function save(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/people/save/route");
  return POST(
    new Request("http://localhost/api/people/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ personId: "person-1", ...body }),
    }),
  );
}

describe("people save route", () => {
  it.each([
    [{ startupId: "other-users-startup" }],
    [{ searchRunId: "other-users-run" }],
    [{ searchResultId: "other-users-result" }],
  ])("rejects ids the user does not own: %o", async (body) => {
    const response = await save(body);

    expect(response.status).toBe(400);
    expect(listUpsert).not.toHaveBeenCalled();
    expect(savedUpsert).not.toHaveBeenCalled();
  });

  it("saves the person when every linked id is owned", async () => {
    const response = await save({ startupId: "startup-1", searchRunId: "run-1", searchResultId: "result-1" });

    expect(response.status).toBe(200);
    expect(listUpsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ startupId: "startup-1" }) }));
    expect(savedUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ create: expect.objectContaining({ searchRunId: "run-1", searchResultId: "result-1" }) }),
    );
  });
});
