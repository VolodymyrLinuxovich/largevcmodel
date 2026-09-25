import { requireCurrentUser } from "@/lib/auth/current-user";
import { notFound, ok, serverError } from "@/lib/api/respond";
import { getMeetingBrief } from "@/lib/briefs/service";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const brief = await getMeetingBrief(prisma, user.id, id);
    if (!brief) return notFound("Meeting brief not found");
    return ok({ brief });
  } catch (error) {
    return serverError(error);
  }
}
