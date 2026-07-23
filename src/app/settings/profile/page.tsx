import { ProfileEditor } from "@/components/profile/profile-editor";
import { HeroHeader, PageFrame, Section, SignInPanel } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { ensureProfile } from "@/lib/profile";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ProfileSettingsPage() {
  const user = await getCurrentUser();
  if (!user) {
    const data = await getWorkspaceData();
    return <SignInPanel data={data} />;
  }

  const profile = await ensureProfile(prisma, user);
  const [product, project, achievement] = await Promise.all([
    prisma.product.findFirst({ where: { ownerUserId: user.id, isFeatured: true }, orderBy: { updatedAt: "desc" } }),
    prisma.project.findFirst({ where: { ownerUserId: user.id }, orderBy: { updatedAt: "desc" } }),
    prisma.achievement.findFirst({ where: { ownerUserId: user.id, archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { updatedAt: "desc" }] }),
  ]);

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="SETTINGS / PROFILE"
        title="Build a credible public surface."
        body="Profile data is separate from private Gmail, Calendar, contact, and relationship evidence. Only fields saved here are eligible for public display."
      />
      <Section title="Profile editor">
        <ProfileEditor
          profile={{
            username: profile.username,
            fullName: profile.fullName,
            headline: profile.headline,
            bio: profile.bio,
            location: profile.location,
            status: profile.status,
            availability: profile.availability,
            avatarUrl: profile.avatarUrl,
            websiteUrl: profile.websiteUrl,
            visibility: profile.visibility,
            messagingPermission: profile.messagingPermission,
            connectionPermission: profile.connectionPermission,
            socialLinks: (profile.socialLinks as { linkedin?: string; github?: string; x?: string } | null) ?? null,
          }}
          product={
            product
              ? {
                  id: product.id,
                  name: product.name,
                  role: product.role,
                  description: product.description,
                  category: product.category,
                  stage: product.stage,
                  teamSize: product.teamSize,
                  fundingStatus: product.fundingStatus,
                  tractionMetric:
                    product.tractionMetrics && typeof product.tractionMetrics === "object" && !Array.isArray(product.tractionMetrics)
                      ? String((product.tractionMetrics as Record<string, unknown>).selfReported ?? "")
                      : null,
                  websiteUrl: product.websiteUrl,
                  demoUrl: product.demoUrl,
                  repositoryUrl: product.repositoryUrl,
                  logoUrl: product.logoUrl,
                  coverImageUrl: product.coverImageUrl,
                }
              : null
          }
          project={
            project
              ? {
                  id: project.id,
                  name: project.name,
                  description: project.description,
                  role: project.role,
                  technologies: project.technologies.join(", "),
                  categories: project.categories.join(", "),
                  status: project.status,
                  launchDate: project.launchDate?.toISOString().slice(0, 10),
                  keyMetric: project.keyMetric,
                  websiteUrl: project.websiteUrl,
                  logoUrl: project.logoUrl,
                  coverImageUrl: project.coverImageUrl,
                }
              : null
          }
          achievement={
            achievement
              ? {
                  id: achievement.id,
                  type: achievement.type,
                  title: achievement.title,
                  organization: achievement.organization,
                  date: achievement.date?.toISOString().slice(0, 10),
                  description: achievement.description,
                  imageUrl: achievement.imageUrl,
                  verificationUrl: achievement.verificationUrl,
                }
              : null
          }
        />
      </Section>
    </PageFrame>
  );
}
