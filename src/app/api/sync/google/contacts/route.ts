import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { syncGoogleContacts } from "@/lib/google/contacts";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const result = await syncGoogleContacts(prisma, user.id);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "contacts_sync_failed" }, { status: 400 });
  }
}
