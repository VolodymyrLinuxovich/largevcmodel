import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { getGoogleAvailability } from "@/lib/google/calendar";
import { prisma } from "@/lib/prisma";

const querySchema = z.object({
  timeMin: z.string().datetime(),
  timeMax: z.string().datetime(),
  timezone: z.string().optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireCurrentUser();
    const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams.entries()));
    if (!parsed.success) return badRequest("Invalid availability request", parsed.error.flatten());
    const availability = await getGoogleAvailability(prisma, user.id, parsed.data);
    return ok({ availability });
  } catch (error) {
    return serverError(error);
  }
}
