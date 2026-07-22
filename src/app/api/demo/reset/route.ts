import { prisma } from "@/lib/prisma";
import { resetDemoData } from "@/lib/demo/reset";
import { ok, serverError } from "@/lib/api/respond";

export async function POST() {
  try {
    const result = await resetDemoData(prisma);
    return ok({ reset: true, ...result });
  } catch (error) {
    return serverError(error);
  }
}
