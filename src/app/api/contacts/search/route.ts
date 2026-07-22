import { prisma } from "@/lib/prisma";
import { ok, serverError } from "@/lib/api/respond";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const q = (searchParams.get("q") ?? "").toLowerCase();
    const contacts = await prisma.contact.findMany({
      where: q
        ? {
            OR: [
              { fullName: { contains: q } },
              { sector: { contains: q } },
              { location: { contains: q } },
              { company: { name: { contains: q } } },
              { company: { sector: { contains: q } } },
            ],
          }
        : undefined,
      include: {
        company: true,
        founderProfile: true,
        fitScores: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ relationshipStrength: "desc" }, { fullName: "asc" }],
      take: 25,
    });
    return ok({ contacts });
  } catch (error) {
    return serverError(error);
  }
}
