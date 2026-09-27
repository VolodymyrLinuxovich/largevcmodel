import { IntegrationService, SyncJobStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { queueSyncJob } from "@/lib/sync/jobs";

describe("sync job enqueueing", () => {
  it("creates the job inside a serializable transaction", async () => {
    const created = {
      id: "job-1",
      userId: "user-1",
      provider: "GMAIL" as const,
      status: SyncJobStatus.PENDING,
      createdAt: new Date(),
    };
    const create = vi.fn().mockResolvedValue(created);
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>, options: unknown) => {
      expect(options).toEqual({ isolationLevel: "Serializable" });
      return callback({
        syncJob: {
          findFirst: vi.fn().mockResolvedValue(null),
          create,
        },
      });
    });
    const prisma = {
      $transaction: transaction,
      integration: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      auditEvent: { create: vi.fn().mockResolvedValue(undefined) },
    } as unknown as PrismaClient;

    await expect(queueSyncJob(prisma, { userId: "user-1", service: IntegrationService.GMAIL, actor: "user@example.com" })).resolves.toEqual(created);
    expect(transaction).toHaveBeenCalledOnce();
    expect(create).toHaveBeenCalledOnce();
  });

  it("returns an existing active job without creating or auditing another one", async () => {
    const existing = {
      id: "job-existing",
      userId: "user-1",
      provider: "GMAIL" as const,
      status: SyncJobStatus.RUNNING,
      createdAt: new Date(),
    };
    const transaction = vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
      callback({ syncJob: { findFirst: vi.fn().mockResolvedValue(existing), create: vi.fn() } }),
    );
    const prisma = {
      $transaction: transaction,
      integration: { updateMany: vi.fn() },
      auditEvent: { create: vi.fn() },
    } as unknown as PrismaClient;

    await expect(queueSyncJob(prisma, { userId: "user-1", service: IntegrationService.GMAIL, actor: "user@example.com" })).resolves.toEqual(existing);
    expect(prisma.integration.updateMany).not.toHaveBeenCalled();
    expect(prisma.auditEvent.create).not.toHaveBeenCalled();
  });
});
