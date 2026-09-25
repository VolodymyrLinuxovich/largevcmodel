import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { generateMeetingBrief, listMeetingBriefs } from "@/lib/briefs/service";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

const generateBriefSchema = z.object({ calendarEventId: z.string().trim().min(1).max(64).nullable().optional() }).strict();

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    return ok({ briefs: await listMeetingBriefs(prisma, user.id, id) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request, { params }: Params) {
  try {
    const user = await requireCurrentUser();
    const { id } = await params;
    const input = await parseJsonBody(request, generateBriefSchema, "Invalid meeting brief request");
    return ok({ brief: await generateMeetingBrief(prisma, user, id, { calendarEventId: input.calendarEventId }) }, 201);
  } catch (error) {
    return serverError(error);
  }
}
