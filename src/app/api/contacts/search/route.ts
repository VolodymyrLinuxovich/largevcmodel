import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").trim();
    const contacts = await prisma.contact.findMany({
      where: q
        ? {
            userId: user.id,
            OR: [
              { fullName: { contains: q, mode: "insensitive" } },
              { primaryEmail: { contains: q, mode: "insensitive" } },
              { organization: { contains: q, mode: "insensitive" } },
              { title: { contains: q, mode: "insensitive" } },
              { notes: { contains: q, mode: "insensitive" } },
            ],
          }
        : { userId: user.id },
      include: {
        company: true,
        fitScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
      },
      orderBy: [{ relationshipStrength: "desc" }, { fullName: "asc" }],
      take: 50,
    });
    return ok({ contacts });
  } catch (error) {
    return serverError(error);
  }
}
