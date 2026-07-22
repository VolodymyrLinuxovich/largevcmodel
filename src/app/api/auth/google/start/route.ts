import { NextResponse } from "next/server";
import { z } from "zod";
import { createGoogleAuthRedirect } from "@/lib/google/oauth";

const serviceSchema = z.enum(["signin", "gmail", "contacts", "calendar"]).default("signin");

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const parsed = serviceSchema.safeParse(searchParams.get("service") ?? "signin");
  if (!parsed.success) {
    return NextResponse.redirect(new URL("/settings?error=invalid_google_service", request.url));
  }

  try {
    return createGoogleAuthRedirect(request, parsed.data);
  } catch (error) {
    const url = new URL("/settings", request.url);
    url.searchParams.set("error", error instanceof Error ? error.message : "oauth_start_failed");
    return NextResponse.redirect(url);
  }
}
