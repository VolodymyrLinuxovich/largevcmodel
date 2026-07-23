import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { normalizeUsername, usernameAvailable } from "@/lib/profile";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  const username = normalizeUsername(new URL(request.url).searchParams.get("username") ?? "");
  if (username.length < 3) return NextResponse.json({ username, available: false });
  const available = await usernameAvailable(prisma, username, user?.id);
  return NextResponse.json({ username, available });
}
