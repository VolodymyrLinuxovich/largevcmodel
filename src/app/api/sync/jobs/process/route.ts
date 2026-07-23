import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { processNextSyncJobs } from "@/lib/sync/jobs";

export async function POST() {
  try {
    const user = await requireCurrentUser();
    const result = await processNextSyncJobs(prisma, { userId: user.id, maxJobs: 3 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "sync_job_processing_failed" }, { status: 400 });
  }
}
