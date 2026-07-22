import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { badRequest, notFound, ok, serverError } from "@/lib/api/respond";
import { researchSingleFounder } from "@/lib/domain/research-service";

const requestSchema = z.object({
  contactId: z.string().min(1),
  query: z.string().optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid research request", body.error.flatten());
    const result = await researchSingleFounder(prisma, body.data);
    if (!result) return notFound("Founder contact not found");
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
