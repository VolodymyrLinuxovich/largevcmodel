import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { linkContactSchema, unlinkContactSchema } from "@/lib/pipeline/schemas";
import { linkOpportunityContact, unlinkOpportunityContact } from "@/lib/pipeline/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await parseJsonBody(request, linkContactSchema, "Invalid contact link");
    return ok({ link: await linkOpportunityContact(prisma, user, id, input) }, 201);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await parseJsonBody(request, unlinkContactSchema, "Invalid contact unlink");
    return ok({ removed: await unlinkOpportunityContact(prisma, user, id, input.contactId) });
  } catch (error) {
    return serverError(error);
  }
}
