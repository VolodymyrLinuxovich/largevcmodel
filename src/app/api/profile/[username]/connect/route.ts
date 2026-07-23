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
    if (profile.userId === user.id) return badRequest("You cannot connect with your own profile.");
    if (profile.connectionPermission === ProfilePermission.NONE) return badRequest("This profile is not accepting connection requests.");
    const connection = await prisma.connection.upsert({
      where: { requesterUserId_recipientUserId: { requesterUserId: user.id, recipientUserId: profile.userId } },
      create: { requesterUserId: user.id, recipientUserId: profile.userId, status: ConnectionStatus.PENDING },
      update: { status: ConnectionStatus.PENDING },
    });
    return ok({ connection });
  } catch (error) {
    return serverError(error);
  }
}
