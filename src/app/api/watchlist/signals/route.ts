import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";
import { listSignals } from "@/lib/watchlist/service";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const unreadOnly = new URL(request.url).searchParams.get("unread") === "1";
    return ok({ signals: await listSignals(prisma, user.id, { unreadOnly }) });
  } catch (error) {
    return serverError(error);
  }
}
