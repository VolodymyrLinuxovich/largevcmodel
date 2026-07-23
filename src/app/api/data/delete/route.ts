import { ContactSource, IntegrationService, Prisma } from "@prisma/client";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  dataset: z.enum(["contacts", "gmail", "calendar"]),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid data deletion request", parsed.error.flatten());

    const recordsDeleted = await deleteDataset(user.id, parsed.data.dataset);
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Imported data deleted",
      outcome: "completed",
      dataSource: parsed.data.dataset,
      details: `${recordsDeleted} imported records removed from LargeVCModel storage.`,
      metadata: { dataset: parsed.data.dataset, recordsDeleted },
    });

    return ok({ recordsDeleted });
  } catch (error) {
    return serverError(error);
  }
}

async function deleteDataset(userId: string, dataset: "contacts" | "gmail" | "calendar") {
  if (dataset === "contacts") {
    const result = await prisma.contact.deleteMany({
      where: { userId, source: { in: [ContactSource.GOOGLE_CONTACTS, ContactSource.GMAIL] } },
    });
    await prisma.integration.updateMany({
      where: { userId, service: { in: [IntegrationService.GOOGLE_CONTACTS, IntegrationService.GMAIL] } },
      data: { recordsProcessed: 0, syncCursor: Prisma.JsonNull },
    });
    return result.count;
  }

  if (dataset === "gmail") {
    const [replies, outreachEvents, outreachDrafts, threads] = await prisma.$transaction([
      prisma.reply.deleteMany({ where: { userId } }),
      prisma.outreachEvent.deleteMany({ where: { userId } }),
      prisma.outreachDraft.deleteMany({ where: { userId } }),
      prisma.gmailThread.deleteMany({ where: { userId } }),
      prisma.integration.updateMany({
        where: { userId, service: IntegrationService.GMAIL },
        data: { recordsProcessed: 0, syncCursor: Prisma.JsonNull },
      }),
    ]);
    return replies.count + outreachEvents.count + outreachDrafts.count + threads.count;
  }

  const [meetings, events] = await prisma.$transaction([
    prisma.meeting.deleteMany({ where: { userId } }),
    prisma.calendarEvent.deleteMany({ where: { userId } }),
    prisma.integration.updateMany({
      where: { userId, service: IntegrationService.GOOGLE_CALENDAR },
      data: { recordsProcessed: 0, syncCursor: Prisma.JsonNull },
    }),
  ]);
  return meetings.count + events.count;
}
