import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileUserId = url.searchParams.get("profileUserId");
  const linkType = url.searchParams.get("linkType") ?? "external";
  const targetUrl = url.searchParams.get("targetUrl");
  if (!profileUserId || !targetUrl) return NextResponse.redirect(new URL("/", request.url));

  let parsedTarget: URL;
  try {
    parsedTarget = new URL(targetUrl);
  } catch {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const user = await getCurrentUser();
  await prisma.profileLinkClick.create({
    data: {
      profileUserId,
      linkType,
      targetUrl: parsedTarget.toString(),
      viewerUserId: user?.id,
    },
  }).catch(() => undefined);

  return NextResponse.redirect(parsedTarget);
}
