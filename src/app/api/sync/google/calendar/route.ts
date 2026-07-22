import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { syncGoogleCalendar } from "@/lib/google/calendar";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const result = await syncGoogleCalendar(prisma, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "calendar_sync_failed" }, { status: 400 });
  }
}
