import { redirect } from "next/navigation";
import { SignInPanel } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { ensureProfile } from "@/lib/profile";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function OwnProfilePage() {
  const user = await getCurrentUser();
  if (!user) {
    const data = await getWorkspaceData();
    return <SignInPanel data={data} />;
  }
  const profile = await ensureProfile(prisma, user);
  redirect(`/profile/${profile.username}`);
}
