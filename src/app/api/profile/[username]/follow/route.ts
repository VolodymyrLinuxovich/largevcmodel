import { ConnectionStatus, ProfilePermission } from "@prisma/client";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { username } = await params;
    const profile = await prisma.userProfile.findUnique({ where: { username }, select: { userId: true, connectionPermission: true } });
    if (!profile) return notFound("Profile not found");
    if (profile.userId === user.id) return badRequest("You cannot follow your own profile.");
    if (profile.connectionPermission === ProfilePermission.NONE) return badRequest("This profile is not accepting follows.");
    await prisma.follow.upsert({
      where: { followerUserId_followedUserId: { followerUserId: user.id, followedUserId: profile.userId } },
      create: { followerUserId: user.id, followedUserId: profile.userId },
      update: {},
    });
    await prisma.profileActivity.create({
      data: {
        ownerUserId: user.id,
        activityType: "FOLLOW",
        subjectType: "UserProfile",
        subjectId: profile.userId,
        text: "Followed a profile.",
        visibility: "PRIVATE",
        source: "PLATFORM_ACTION",
      },
    });
    return ok({ status: ConnectionStatus.ACCEPTED });
  } catch (error) {
    return serverError(error);
  }
}
