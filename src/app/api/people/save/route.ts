import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";

const savePersonSchema = z.object({
  personId: z.string().min(1),
  startupId: z.string().optional().nullable(),
  listId: z.string().optional().nullable(),
  listName: z.string().trim().min(1).max(120).default("Saved People"),
  searchRunId: z.string().optional().nullable(),
  searchResultId: z.string().optional().nullable(),
  notes: z.string().max(3000).optional().nullable(),
  tags: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
  savedReason: z.string().max(1000).optional().nullable(),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = savePersonSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid saved-person request", body.error.flatten());
    const person = await prisma.discoveredPerson.findFirst({
      where: { id: body.data.personId, userId: user.id },
      select: { id: true, fullName: true },
    });
    if (!person) return badRequest("Person not found.");
    const list =
      body.data.listId
        ? await prisma.savedPeopleList.findFirst({ where: { id: body.data.listId, userId: user.id } })
        : await prisma.savedPeopleList.upsert({
            where: { userId_name: { userId: user.id, name: body.data.listName } },
            create: { userId: user.id, startupId: body.data.startupId ?? null, name: body.data.listName },
            update: { startupId: body.data.startupId ?? undefined },
          });
    if (!list) return badRequest("Saved list not found.");
    const saved = await prisma.savedPerson.upsert({
      where: { listId_personId: { listId: list.id, personId: person.id } },
      create: {
        userId: user.id,
        listId: list.id,
        personId: person.id,
        searchRunId: body.data.searchRunId ?? null,
        searchResultId: body.data.searchResultId ?? null,
        notes: body.data.notes ?? null,
        tags: body.data.tags,
        savedReason: body.data.savedReason ?? null,
      },
      update: {
        searchRunId: body.data.searchRunId ?? undefined,
        searchResultId: body.data.searchResultId ?? undefined,
        notes: body.data.notes ?? undefined,
        tags: body.data.tags.length ? body.data.tags : undefined,
        savedReason: body.data.savedReason ?? undefined,
      },
    });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Person saved",
      outcome: "completed",
      dataSource: "External discovery",
      details: person.fullName,
      metadata: { listId: list.id, personId: person.id },
    });
    return ok({ saved, list });
  } catch (error) {
    return serverError(error);
  }
}
