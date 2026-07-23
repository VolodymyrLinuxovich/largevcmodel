import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState, HeroHeader, PageFrame, Section } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { canViewProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ProfileProjectsPage({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  const viewer = await getCurrentUser();
  const profile = await prisma.userProfile.findUnique({ where: { username } });
  if (!profile) notFound();
  if (!(await canViewProfile(prisma, profile, viewer?.id))) notFound();
  const projects = await prisma.project.findMany({ where: { ownerUserId: profile.userId }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="PROFILE / PROJECTS"
        title={`${profile.fullName ?? profile.username} projects`}
        body="Projects are profile-owned records. They do not expose private Gmail, Calendar, contact, or relationship evidence."
        actions={<Button asChild variant="outline"><Link href={`/profile/${profile.username}`}>Back to profile</Link></Button>}
      />
      <Section title="Projects">
        {projects.length ? (
          <div className="divide-y divide-border border-y border-border">
            {projects.map((project) => (
              <Link key={project.id} href={`/projects/${project.slug}`} className="grid gap-4 py-5 transition-colors hover:text-primary md:grid-cols-[1fr_180px]">
                <div>
                  <p className="text-lg font-semibold">{project.name}</p>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">{project.description ?? "No description provided."}</p>
                </div>
                <Badge variant="outline">{project.status.replaceAll("_", " ")}</Badge>
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState title="No projects" body="No public projects have been added." />
        )}
      </Section>
    </PageFrame>
  );
}
