import { ProfilePermission } from "@prisma/client";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";

const messageSchema = z.object({
  body: z.string().trim().min(2).max(2000).default("I'd like to connect."),
});

export async function POST(request: Request, { params }: { params: Promise<{ username: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { username } = await params;
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const parsed = messageSchema.safeParse(body);
    if (!parsed.success) return badRequest("Invalid message request", parsed.error.flatten());
    const profile = await prisma.userProfile.findUnique({ where: { username }, select: { userId: true, messagingPermission: true } });
    if (!profile) return notFound("Profile not found");
    if (profile.userId === user.id) return badRequest("You cannot message your own profile.");
    if (profile.messagingPermission === ProfilePermission.NONE) return badRequest("This profile is not accepting messages.");

    if (profile.messagingPermission === ProfilePermission.CONNECTIONS) {
      const connected = await prisma.connection.findFirst({
        where: {
          status: "ACCEPTED",
          OR: [
            { requesterUserId: user.id, recipientUserId: profile.userId },
            { requesterUserId: profile.userId, recipientUserId: user.id },
          ],
        },
      });
      if (!connected) return badRequest("This profile only accepts messages from connections.");
    }

    const thread = await prisma.messageThread.create({
      data: {
        participants: {
          create: [
            { userId: user.id, lastReadAt: new Date() },
            { userId: profile.userId },
          ],
        },
        messages: {
          create: {
            senderUserId: user.id,
            body: parsed.data.body,
          },
        },
      },
    });
    return ok({ threadId: thread.id });
  } catch (error) {
    return serverError(error);
  }
}
