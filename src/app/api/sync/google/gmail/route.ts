import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { syncGmail } from "@/lib/google/gmail";

const payloadSchema = z.object({ query: z.string().max(500).optional() });

export async function POST(request: Request) {
  try {
    const user = await requireCurrentUser();
    const body = request.headers.get("content-type")?.includes("application/json") ? await request.json() : {};
    const parsed = payloadSchema.parse(body);
    const result = await syncGmail(prisma, user.id, parsed.query);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "gmail_sync_failed" }, { status: 400 });
  }
}
