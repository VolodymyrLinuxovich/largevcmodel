import { requireCurrentUser } from "@/lib/auth/current-user";
import { badRequest, ok, serverError } from "@/lib/api/respond";
import { prisma } from "@/lib/prisma";
import { searchPeople } from "@/lib/people/search";
import { peopleSearchRequestSchema } from "@/lib/people/types";

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = peopleSearchRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid people search request", body.error.flatten());
    const result = await searchPeople(prisma, user.id, body.data);
    return ok(result);
  } catch (error) {
    return serverError(error);
  }
}
