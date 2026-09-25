import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { finalizeInvestmentMemo } from "@/lib/memos/service";
import { optionalText } from "@/lib/pipeline/schemas";
import { prisma } from "@/lib/prisma";

const finalizeSchema = z.object({ reviewerNotes: optionalText(5000), confirmFinalize: z.literal(true) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await parseJsonBody(request, finalizeSchema, "Finalizing requires confirmFinalize: true");
    return ok({ memo: await finalizeInvestmentMemo(prisma, user, id, input.reviewerNotes ?? null) });
  } catch (error) {
    return serverError(error);
  }
}
