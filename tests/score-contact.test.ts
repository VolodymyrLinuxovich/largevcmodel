import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { scoreContact } from "@/lib/domain/research-service";

describe("contact fit scoring", () => {
  it("counts only claims that are backed by a source as supported evidence", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "c1", companyId: null, company: null, claims: [], sources: [], interactionCount: 0 });
    const prisma = {
      contact: { findFirst },
      investmentThesis: { findFirst: vi.fn().mockResolvedValue(null) },
      fitScore: { create: vi.fn().mockResolvedValue({ id: "f1" }) },
      auditEvent: { create: vi.fn() },
    } as unknown as PrismaClient;

    await scoreContact(prisma, "user-1", "c1");

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "c1", userId: "user-1" },
        include: expect.objectContaining({ claims: { where: { sources: { some: {} } } } }),
      }),
    );
  });
});
