import { Badge } from "@/components/ui/badge";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { getWorkspaceData } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const events = await prisma.auditEvent.findMany({
    where: { userId: data.user.id },
    include: { affectedContact: true, researchRun: true },
    orderBy: { timestamp: "desc" },
    take: 100,
  });

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="AUDIT / OPERATIONS"
        title="Inspect actions and outcomes."
        body="The audit log records integration changes, sync events, research runs, scoring, draft generation, approvals, Gmail sends, Calendar writes, errors, and fallbacks without exposing private model reasoning."
      />
      <Section title="Action trace">
        {events.length ? (
          <div className="overflow-x-auto border border-border">
            <table className="w-full min-w-[980px] text-left text-sm">
              <thead className="border-b border-border font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Contact</th>
                  <th className="px-4 py-3">Data source</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {events.map((event) => (
                  <tr key={event.id} className="align-top hover:bg-muted">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground"><Timestamp value={event.timestamp} /></td>
                    <td className="px-4 py-3">
                      <p>{event.actor}</p>
                      <p className="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">{event.actorType}</p>
                    </td>
                    <td className="px-4 py-3">{event.action}</td>
                    <td className="px-4 py-3"><Badge variant={event.outcome === "completed" ? "success" : "warning"}>{event.outcome}</Badge></td>
                    <td className="px-4 py-3">{event.affectedContact?.fullName ?? event.affectedContact?.primaryEmail ?? "-"}</td>
                    <td className="px-4 py-3">{event.dataSource ?? "-"}</td>
                    <td className="max-w-[440px] px-4 py-3 text-xs leading-5 text-muted-foreground">{event.details ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No audit events" body="The workspace has no recorded actions yet." />
        )}
      </Section>
    </PageFrame>
  );
}
