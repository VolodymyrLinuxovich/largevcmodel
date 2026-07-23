import { requireCurrentUser } from "@/lib/auth/current-user";
import { serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, { params }: { params: Promise<{ startupId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { startupId } = await params;
    const deck = await prisma.pitchDeck.findFirst({
      where: { userId: user.id, startupId, deletedAt: null },
      orderBy: { uploadedAt: "desc" },
      select: { filename: true, mimeType: true, fileData: true },
    });
    if (!deck) return new Response("Pitch deck not found.", { status: 404 });
    return new Response(deck.fileData, {
      headers: {
        "content-type": deck.mimeType,
        "content-disposition": `inline; filename="${deck.filename.replace(/"/g, "")}"`,
        "cache-control": "private, no-store",
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
