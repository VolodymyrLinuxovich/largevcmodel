import { requireCurrentUser } from "@/lib/auth/current-user";
import { notFound, ok, serverError } from "@/lib/api/respond";
import { getInvestmentMemo } from "@/lib/memos/service";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const memo = await getInvestmentMemo(prisma, user.id, id);
    if (!memo) return notFound("IC memo not found");
    return ok({ memo });
  } catch (error) {
    return serverError(error);
  }
}
