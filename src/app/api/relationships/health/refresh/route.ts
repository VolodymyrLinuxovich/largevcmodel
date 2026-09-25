import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { refreshRelationshipHealth } from "@/lib/domain/relationship-health-service";
import { prisma } from "@/lib/prisma";

const refreshHealthRequestSchema = z
  .object({
    contactIds: z.array(z.string().min(1).max(64)).min(1).max(500).optional(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = refreshHealthRequestSchema.safeParse(await request.json().catch(() => ({})));
    if (!body.success) return badRequest("Invalid relationship health refresh request", body.error.flatten());
    const result = await refreshRelationshipHealth(prisma, user.id, { contactIds: body.data.contactIds });
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Relationship health recalculated",
      outcome: "completed",
      dataSource: "Gmail and Google Calendar interactions",
      details: `${result.calculated} contacts recalculated; ${result.changed} changed.`,
    });
    return ok({ calculated: result.calculated, changed: result.changed });
  } catch (error) {
    return serverError(error);
  }
}
