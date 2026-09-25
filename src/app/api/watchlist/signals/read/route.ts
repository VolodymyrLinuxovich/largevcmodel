import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";
import { markSignalsReadSchema } from "@/lib/watchlist/schemas";
import { markSignalsRead } from "@/lib/watchlist/service";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = await parseJsonBody(request, markSignalsReadSchema, "Provide signalIds or all: true");
    return ok({ updated: await markSignalsRead(prisma, user.id, input) });
  } catch (error) {
    return serverError(error);
  }
}
