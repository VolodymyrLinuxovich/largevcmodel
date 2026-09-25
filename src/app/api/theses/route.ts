import { requireCurrentUser } from "@/lib/auth/current-user";
import { ok, serverError } from "@/lib/api/respond";
import { parseJsonBody } from "@/lib/api/validation";
import { createThesis, listTheses, thesisInputSchema } from "@/lib/pipeline/thesis";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    return ok({ theses: await listTheses(prisma, user.id) });
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const input = await parseJsonBody(request, thesisInputSchema, "Invalid investment thesis");
    return ok({ thesis: await createThesis(prisma, user, input) }, 201);
  } catch (error) {
    return serverError(error);
  }
}
