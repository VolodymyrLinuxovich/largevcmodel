import Link from "next/link";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState, HeroHeader, PageFrame, Section, Timestamp } from "@/components/workspace/core";
import { getCurrentUser } from "@/lib/auth/current-user";
import { prisma } from "@/lib/prisma";
import { canViewProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params;
  const viewer = await getCurrentUser();
  const project = await prisma.project.findFirst({
    where: { slug: projectSlug },
    include: { owner: { include: { profile: true } } },
    orderBy: { updatedAt: "desc" },
  });
  if (!project || !project.owner.profile) notFound();
  if (!(await canViewProfile(prisma, project.owner.profile, viewer?.id))) notFound();

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="PROJECT"
        title={project.name}
        body={project.description ?? "No project description has been added."}
        supportingLine={[project.role, project.status, project.launchDate ? `Launched ${project.launchDate.toISOString().slice(0, 10)}` : null].filter(Boolean).join(" / ")}
        actions={
          <>
            <Button asChild variant="outline"><Link href={`/profile/${project.owner.profile.username}`}>Owner profile</Link></Button>
            {project.websiteUrl ? <Button asChild><a href={project.websiteUrl} target="_blank" rel="noreferrer">Open project</a></Button> : null}
          </>
        }
      />
      <Section title="Project details">
        <div className="grid gap-8 xl:grid-cols-[1fr_360px]">
          <div className="border-y border-border py-6">
            <p className="text-sm leading-7 text-muted-foreground">{project.description ?? "No description provided."}</p>
            <div className="mt-6 flex flex-wrap gap-2">
              {[...project.technologies, ...project.categories].map((item) => <Badge key={item} variant="muted">{item}</Badge>)}
            </div>
          </div>
          <div className="space-y-4">
            <Detail label="Role" value={project.role} />
            <Detail label="Status" value={project.status.replaceAll("_", " ")} />
            <Detail label="Key metric" value={project.keyMetric} />
            <Detail label="Verification" value={project.verificationStatus.replaceAll("_", " ")} />
            <Detail label="Updated" value={<Timestamp value={project.updatedAt} />} />
          </div>
        </div>
      </Section>
      {!project.websiteUrl ? (
        <Section title="External links">
          <EmptyState title="No public project link" body="The owner has not published an external project URL." />
        </Section>
      ) : null}
    </PageFrame>
  );
}

function Detail({ label, value }: { label: string; value?: ReactNode | null }) {
  return (
    <div className="border-y border-border py-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-3 text-sm text-muted-foreground">{value ?? "Unavailable"}</p>
    </div>
  );
}
