import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { saveStartupProfile, startupProfileInputSchema } from "@/lib/startups/profile";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const startups = await prisma.startupProfile.findMany({
      where: { userId: user.id },
      orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
      include: {
        pitchDecks: {
          where: { deletedAt: null },
          orderBy: { uploadedAt: "desc" },
          take: 1,
          select: { id: true, filename: true, extractionStatus: true, uploadedAt: true, extractionConfidence: true },
        },
        savedLists: { select: { id: true, name: true, _count: { select: { people: true } } } },
      },
    });
    return ok({ startups });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = startupProfileInputSchema.safeParse(await request.json());
    if (!body.success) {
      if (process.env.NODE_ENV === "development") {
        console.error("Startup profile validation failed", body.error.flatten());
      }
      return NextResponse.json(
        {
          error: "VALIDATION_ERROR",
          message: "One or more fields are invalid.",
          fields: fieldErrorMessages(body.error.flatten().fieldErrors),
        },
        { status: 400 },
      );
    }
    const startup = await saveStartupProfile(prisma, user.id, body.data);
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: body.data.id ? "Startup profile updated" : "Startup profile created",
      outcome: "completed",
      dataSource: "User provided",
      details: startup.name,
      metadata: { startupId: startup.id, completeness: startup.profileCompleteness },
    });
    return ok({ startup });
  } catch (error) {
    return serverError(error);
  }
}

function fieldErrorMessages(fieldErrors: Record<string, string[] | undefined>) {
  return Object.fromEntries(
    Object.entries(fieldErrors)
      .map(([field, messages]) => [field, messages?.[0]])
      .filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
}
