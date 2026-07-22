import "server-only";

import { prisma } from "@/lib/prisma";
import { getSession } from "./session";

export async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;

  try {
    return await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, imageUrl: true, role: true },
    });
  } catch {
    return null;
  }
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Authentication required");
  }
  return user;
}
