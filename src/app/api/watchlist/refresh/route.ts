import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";
import { refreshWatchSignals } from "@/lib/watchlist/service";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    return ok(await refreshWatchSignals(prisma, user.id));
  } catch (error) {
    return serverError(error);
  }
}
