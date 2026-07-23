import { NextResponse } from "next/server";
import { requireCurrentUser } from "@/lib/auth/current-user";
import { networkSearchRequestSchema, parseNetworkObjective } from "@/lib/domain/network-search";
import { badRequest } from "@/lib/api/respond";

export async function POST(request: Request) {
  try {
    await requireCurrentUser();
    const body = networkSearchRequestSchema.safeParse(await request.json());
    if (!body.success) return badRequest("Invalid search interpretation request", body.error.flatten());
    return NextResponse.json({ interpreted: parseNetworkObjective(body.data) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "search_interpretation_failed" }, { status: 400 });
  }
}
