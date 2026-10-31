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

describe("sync job processing", () => {
  it("skips jobs for disconnected services and keeps going after a failed job", async () => {
    vi.resetModules();
    const syncGmail = vi.fn().mockRejectedValue(new Error("Gmail quota"));
    const syncGoogleContacts = vi.fn().mockResolvedValue({ imported: 2, nextPageToken: null, done: true });
    const syncGoogleCalendar = vi.fn();
    vi.doMock("@/lib/google/gmail", () => ({ syncGmail }));
    vi.doMock("@/lib/google/contacts", () => ({ syncGoogleContacts }));
    vi.doMock("@/lib/google/calendar", () => ({ syncGoogleCalendar }));
    vi.doMock("@/lib/watchlist/service", () => ({ refreshWatchSignals: vi.fn() }));
    const { processNextSyncJobs } = await import("@/lib/sync/jobs");

    const jobs = [
      { id: "job-mail", userId: "user-1", provider: "GMAIL", status: SyncJobStatus.FAILED, cursor: null, startedAt: null },
      { id: "job-contacts", userId: "user-1", provider: "GOOGLE_CONTACTS", status: SyncJobStatus.PENDING, cursor: null, startedAt: null },
      { id: "job-cal", userId: "user-1", provider: "GOOGLE_CALENDAR", status: SyncJobStatus.PENDING, cursor: null, startedAt: null },
    ];
    const integrationUpdates: unknown[] = [];
    const prisma = {
      integration: {
        findMany: vi.fn().mockResolvedValue([{ service: "GMAIL" }, { service: "GOOGLE_CONTACTS" }]),
        updateMany: vi.fn(async (args: unknown) => (integrationUpdates.push(args), { count: 1 })),
      },
      syncJob: {
        findMany: vi.fn(async ({ where }: { where: { provider: { in: string[] } } }) => jobs.filter((job) => where.provider.in.includes(job.provider))),
        findUnique: vi.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id)),
        update: vi.fn(async ({ where }: { where: { id: string } }) => jobs.find((job) => job.id === where.id)),
        count: vi.fn().mockResolvedValue(0),
      },
      auditEvent: { create: vi.fn() },
    } as unknown as PrismaClient;

    const result = await processNextSyncJobs(prisma, { userId: "user-1" });

    expect(result).toEqual({ processed: 1, failed: 1, remaining: 0 });
    expect(syncGoogleCalendar).not.toHaveBeenCalled();
    expect(syncGoogleContacts).toHaveBeenCalledOnce();
    expect(integrationUpdates).toContainEqual(expect.objectContaining({ where: expect.objectContaining({ status: "CONNECTED" }) }));
  });

  it("does nothing when no Google service is connected", async () => {
    const { processNextSyncJobs } = await import("@/lib/sync/jobs");
    const prisma = {
      integration: { findMany: vi.fn().mockResolvedValue([]) },
      syncJob: { findMany: vi.fn() },
    } as unknown as PrismaClient;

    expect(await processNextSyncJobs(prisma, { userId: "user-1" })).toEqual({ processed: 0, failed: 0, remaining: 0 });
    expect(prisma.syncJob.findMany).not.toHaveBeenCalled();
  });
});
