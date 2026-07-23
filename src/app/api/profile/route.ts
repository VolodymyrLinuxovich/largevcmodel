import { audit } from "@/lib/audit";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";
import { profileSaveSchema, saveProfile } from "@/lib/profile";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = profileSaveSchema.safeParse(await request.json());
    if (!parsed.success) return badRequest("Invalid profile payload", parsed.error.flatten());
    const profile = await saveProfile(prisma, user.id, parsed.data);
    await audit(prisma, {
      userId: user.id,
      actor: user.email,
      actorType: "USER",
      action: "Profile updated",
      outcome: "completed",
      dataSource: "User profile",
      details: "The user updated public profile fields or featured profile records.",
    });
    return ok({ profile });
  } catch (error) {
    return serverError(error);
  }
}
