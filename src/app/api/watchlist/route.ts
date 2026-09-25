import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { prisma } from "@/lib/prisma";
import { addWatchSchema, removeWatchSchema } from "@/lib/watchlist/schemas";
import { addToWatchlist, listWatchlist, removeFromWatchlist } from "@/lib/watchlist/service";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return ok({ items: await listWatchlist(prisma, user.id) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = await parseJsonBody(request, addWatchSchema, "Invalid watchlist item");
    const result = await addToWatchlist(prisma, user, input);
    return ok(result, result.created ? 201 : 200);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = await parseJsonBody(request, removeWatchSchema, "Invalid watchlist removal");
    await removeFromWatchlist(prisma, user, input.itemId);
    return ok({ removed: true });
  } catch (error) {
    return serverError(error);
  }
}
