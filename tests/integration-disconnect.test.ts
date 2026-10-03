import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ requireCurrentUser: vi.fn() }));
const db = vi.hoisted(() => ({ prisma: {} as Record<string, unknown> }));
const google = vi.hoisted(() => ({ revokeIntegration: vi.fn() }));
const deletion = vi.hoisted(() => ({ deleteImportedDataset: vi.fn() }));

vi.mock("@/lib/auth/current-user", () => auth);
vi.mock("@/lib/prisma", () => db);
vi.mock("@/lib/google/api", () => google);
vi.mock("@/lib/domain/data-deletion", () => deletion);

const user = { id: "user-1", email: "partner@example.com", name: "Partner", imageUrl: null, role: "partner" };

function disconnect(body: unknown) {
  return new Request("http://localhost/api/integrations/int-1/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.requireCurrentUser.mockResolvedValue(user);
  db.prisma = {
    integration: { findFirst: vi.fn().mockResolvedValue({ id: "int-1", userId: "user-1", service: "GOOGLE_CONTACTS" }) },
    auditEvent: { create: vi.fn() },
  };
});

describe("integration disconnect", () => {
  it("deletes imported data and its derived records through the dataset deletion helper", async () => {
    const { POST } = await import("@/app/api/integrations/[id]/disconnect/route");
    const response = await POST(disconnect({ deleteImportedData: true }), { params: Promise.resolve({ id: "int-1" }) });

    expect(response.status).toBe(200);
    expect(google.revokeIntegration).toHaveBeenCalledWith(db.prisma, "user-1", "int-1");
    expect(deletion.deleteImportedDataset.mock.calls.map((call) => call[2])).toEqual(["contacts", "gmail", "calendar"]);
  });

  it("keeps imported data when deletion is not requested", async () => {
    const { POST } = await import("@/app/api/integrations/[id]/disconnect/route");
    const response = await POST(disconnect({}), { params: Promise.resolve({ id: "int-1" }) });

    expect(response.status).toBe(200);
    expect(deletion.deleteImportedDataset).not.toHaveBeenCalled();
  });
});
