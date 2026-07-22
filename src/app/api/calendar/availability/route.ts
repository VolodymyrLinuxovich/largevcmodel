import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api/respond";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const partnerId = searchParams.get("partnerId") ?? undefined;
    const slots = await prisma.calendarSlot.findMany({
      where: {
        status: "available",
        ...(partnerId ? { partnerId } : {}),
      },
      include: { partner: true },
      orderBy: { startTime: "asc" },
    });
    return ok({ slots });
  } catch (error) {
    return serverError(error);
  }
}
