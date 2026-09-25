import { z } from "zod";
import { audit } from "@/lib/audit";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { deleteImportedDataset } from "@/lib/domain/data-deletion";
import { prisma } from "@/lib/prisma";

const requestSchema = z.object({
  dataset: z.enum(["contacts", "gmail", "calendar"]),
});

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = requestSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid data deletion request", parsed.error.flatten());

    const recordsDeleted = await deleteImportedDataset(prisma, user.id, parsed.data.dataset);
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
