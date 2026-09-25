import { requireCurrentUser } from "@/lib/auth/current-user";
import { notFound, ok, serverError } from "@/lib/api/respond";
import { getContactRelationshipHealth } from "@/lib/domain/relationship-health-service";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const health = await getContactRelationshipHealth(prisma, user.id, id);
    if (!health) return notFound("Contact not found");
    return ok({ contactId: id, health });
  } catch (error) {
    return serverError(error);
  }
}
