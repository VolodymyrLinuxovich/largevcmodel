import "server-only";

import { IntegrationService, IntegrationStatus, Prisma, PrismaClient, SyncJobStatus, SyncProvider } from "@prisma/client";
import { audit } from "@/lib/audit";
import { syncGoogleCalendar } from "@/lib/google/calendar";
import { syncGoogleContacts } from "@/lib/google/contacts";
import { syncGmail } from "@/lib/google/gmail";

const providerToService: Record<SyncProvider, IntegrationService> = {
  GOOGLE_CONTACTS: IntegrationService.GOOGLE_CONTACTS,
  GMAIL: IntegrationService.GMAIL,
  GOOGLE_CALENDAR: IntegrationService.GOOGLE_CALENDAR,
};

const serviceToProvider: Record<IntegrationService, SyncProvider> = {
  GOOGLE_CONTACTS: SyncProvider.GOOGLE_CONTACTS,
  GMAIL: SyncProvider.GMAIL,
  GOOGLE_CALENDAR: SyncProvider.GOOGLE_CALENDAR,
};

function cursorPageToken(cursor: Prisma.JsonValue | null | undefined) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return null;
  const value = (cursor as Record<string, unknown>).pageToken;
  return typeof value === "string" ? value : null;
}

function gmailQuery(cursor: Prisma.JsonValue | null | undefined) {
  if (!cursor || typeof cursor !== "object" || Array.isArray(cursor)) return undefined;
  const value = (cursor as Record<string, unknown>).query;
  return typeof value === "string" ? value : undefined;
}

export async function queueSyncJob(
  prisma: PrismaClient,
  input: { userId: string; service: IntegrationService; actor: string },
) {
  const provider = serviceToProvider[input.service];
  const existing = await prisma.syncJob.findFirst({
    where: {
      userId: input.userId,
      provider,
      status: { in: [SyncJobStatus.PENDING, SyncJobStatus.RUNNING] },
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return existing;

  const job = await prisma.syncJob.create({
    data: {
      userId: input.userId,
      provider,
      status: SyncJobStatus.PENDING,
    },
  });

  await prisma.integration.updateMany({
    where: { userId: input.userId, provider: "google", service: input.service, status: IntegrationStatus.CONNECTED },
    data: { syncStatus: "queued", lastError: null },
  });

  await audit(prisma, {
    userId: input.userId,
    actor: input.actor,
    actorType: "SYSTEM",
    action: "Sync queued",
    outcome: "completed",
    dataSource: provider,
    details: "A bounded sync job was queued after OAuth or manual retry.",
    metadata: { jobId: job.id },
  });

  return job;
}

export async function queueInitialGoogleSyncJobs(
  prisma: PrismaClient,
  input: { userId: string; actor: string; services?: IntegrationService[] },
) {
  const services = input.services ?? [
    IntegrationService.GOOGLE_CONTACTS,
    IntegrationService.GMAIL,
    IntegrationService.GOOGLE_CALENDAR,
  ];

  const jobs = [];
  for (const service of services) {
    jobs.push(await queueSyncJob(prisma, { userId: input.userId, service, actor: input.actor }));
  }
  return jobs;
}

async function processJob(prisma: PrismaClient, jobId: string) {
  const job = await prisma.syncJob.findUnique({ where: { id: jobId } });
  if (!job || job.status === SyncJobStatus.COMPLETED) return null;

  const service = providerToService[job.provider];
  await prisma.syncJob.update({
    where: { id: job.id },
    data: {
      status: SyncJobStatus.RUNNING,
      startedAt: job.startedAt ?? new Date(),
      errorMessage: null,
    },
  });

  await audit(prisma, {
    userId: job.userId,
    actor: "Sync worker",
    actorType: "SYSTEM",
    action: "Sync started",
    outcome: "running",
    dataSource: job.provider,
    metadata: { jobId: job.id },
  });

  try {
    const pageToken = cursorPageToken(job.cursor);
    const result =
      service === IntegrationService.GOOGLE_CONTACTS
        ? await syncGoogleContacts(prisma, job.userId, { pageToken, maxPages: 1, pageSize: 100 })
        : service === IntegrationService.GMAIL
          ? await syncGmail(prisma, job.userId, gmailQuery(job.cursor) ?? "newer_than:365d", {
              pageToken,
              maxResults: 25,
            })
          : await syncGoogleCalendar(prisma, job.userId, { pageToken, maxResults: 100 });

    const nextCursor = result.nextPageToken
      ? ({ pageToken: result.nextPageToken, ...(service === IntegrationService.GMAIL ? { query: "newer_than:365d" } : {}) } as Prisma.InputJsonObject)
      : Prisma.JsonNull;

    const updatedJob = await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: result.done ? SyncJobStatus.COMPLETED : SyncJobStatus.PENDING,
        completedAt: result.done ? new Date() : null,
        cursor: nextCursor,
        recordsProcessed: { increment: result.imported },
        errorMessage: null,
      },
    });

    await audit(prisma, {
      userId: job.userId,
      actor: "Sync worker",
      actorType: "SYSTEM",
      action: result.done ? "Sync completed" : "Sync page completed",
      outcome: result.done ? "completed" : "partial",
      dataSource: job.provider,
      details: `${result.imported} records processed in this sync page.`,
      metadata: { jobId: job.id, nextPageToken: Boolean(result.nextPageToken) },
    });

    return updatedJob;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync failure";
    await prisma.syncJob.update({
      where: { id: job.id },
      data: {
        status: SyncJobStatus.FAILED,
        completedAt: new Date(),
        errorMessage: message,
      },
    });
    await prisma.integration.updateMany({
      where: { userId: job.userId, provider: "google", service },
      data: {
        syncStatus: "error",
        lastError: message,
      },
    });
    await audit(prisma, {
      userId: job.userId,
      actor: "Sync worker",
      actorType: "SYSTEM",
      action: "Sync failed",
      outcome: "failed",
      dataSource: job.provider,
      details: message,
      metadata: { jobId: job.id },
    });
    throw error;
  }
}

export async function processNextSyncJobs(
  prisma: PrismaClient,
  input: { userId: string; maxJobs?: number } = { userId: "" },
) {
  const jobs = await prisma.syncJob.findMany({
    where: {
      userId: input.userId,
      status: { in: [SyncJobStatus.PENDING, SyncJobStatus.FAILED] },
    },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    take: input.maxJobs ?? 3,
  });

  const results = [];
  for (const job of jobs) {
    results.push(await processJob(prisma, job.id));
  }

  const remaining = await prisma.syncJob.count({
    where: { userId: input.userId, status: SyncJobStatus.PENDING },
  });

  return { processed: results.filter(Boolean).length, remaining };
}
