import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { generateInvestmentMemo, listInvestmentMemos } from "@/lib/memos/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    return ok({ memos: await listInvestmentMemos(prisma, user.id, id) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    return ok({ memo: await generateInvestmentMemo(prisma, user, id) }, 201);
  } catch (error) {
    return serverError(error);
  }
}
