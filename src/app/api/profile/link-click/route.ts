import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { canViewProfile } from "@/lib/profile";
import { trackedProfileTarget } from "@/lib/profile-links";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const profileUserId = url.searchParams.get("profileUserId");
  const linkType = url.searchParams.get("linkType") ?? "external";
  if (!profileUserId) return NextResponse.redirect(new URL("/", request.url));

  const user = await getCurrentUser();
  const profile = await prisma.userProfile.findUnique({
    where: { userId: profileUserId },
    select: {
      userId: true,
      visibility: true,
      websiteUrl: true,
      socialLinks: true,
      user: {
        select: {
          products: {
            orderBy: [{ isFeatured: "desc" }, { updatedAt: "desc" }],
            take: 1,
            select: { websiteUrl: true, demoUrl: true, repositoryUrl: true },
          },
        },
      },
    },
  });
  if (!profile || !(await canViewProfile(prisma, profile, user?.id))) {
    return NextResponse.redirect(new URL("/", request.url));
  }
  const parsedTarget = trackedProfileTarget(profile, linkType);
  if (!parsedTarget) return NextResponse.redirect(new URL("/", request.url));

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
