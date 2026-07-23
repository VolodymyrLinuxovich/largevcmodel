import { Badge } from "@/components/ui/badge";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { prisma } from "@/lib/prisma";
import { getWorkspaceData } from "@/lib/workspace";

export const dynamic = "force-dynamic";

type AuditRow = {
  id: string;
  timestamp: Date;
  action: string;
  outcome: string;
  dataSource: string;
  details: string;
};

const groupedSyncActions = new Set([
  "Sync started",
  "Sync page completed",
  "Sync completed",
  "Email conversation indexed",
  "Contact imported",
  "Calendar events imported",
]);

export default async function AuditPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const events = await prisma.auditEvent.findMany({
    where: { userId: data.user.id },
    include: { affectedContact: true },
    orderBy: { timestamp: "desc" },
    take: 160,
  });
  const rows = summarizeAudit(events).slice(0, 60);

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="AUDIT LOG"
        title="Actions and outcomes."
        body="Review meaningful workspace actions without exposing private model reasoning, raw provider identifiers, OAuth data, or private message content."
      />
      <Section title="Operational history">
        {rows.length ? (
          <div className="overflow-x-auto border-y border-border">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-border font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((event) => (
                  <tr key={event.id} className="align-top transition-colors hover:text-primary">
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">
                      <Timestamp value={event.timestamp} />
                    </td>
                    <td className="px-4 py-3">{event.action}</td>
                    <td className="px-4 py-3">
                      <Badge variant={event.outcome === "completed" ? "success" : "warning"}>{event.outcome}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{event.dataSource}</td>
                    <td className="max-w-[520px] px-4 py-3 text-xs leading-5 text-muted-foreground">{event.details}</td>
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

function summarizeAudit(
  events: Array<{
    id: string;
    timestamp: Date;
    action: string;
    outcome: string;
    dataSource: string | null;
    details: string | null;
    affectedContact: { fullName: string | null; primaryEmail: string | null } | null;
  }>,
): AuditRow[] {
  const grouped = new Map<string, { latest: Date; source: string; action: string; outcome: string; count: number; records: number }>();
  const rows: AuditRow[] = [];

  for (const event of events) {
    if (groupedSyncActions.has(event.action)) {
      const source = readableSource(event.dataSource);
      const key = `sync:${source}`;
      const current = grouped.get(key);
      const records = extractRecordCount(event.details);
      grouped.set(key, {
        latest: current && current.latest > event.timestamp ? current.latest : event.timestamp,
        source,
        action: source ? `${source} sync completed` : "Sync completed",
        outcome: event.outcome === "failed" ? "failed" : current?.outcome === "failed" ? "failed" : "completed",
        count: (current?.count ?? 0) + 1,
        records: (current?.records ?? 0) + records,
      });
      continue;
    }

    rows.push({
      id: event.id,
      timestamp: event.timestamp,
      action: event.action,
      outcome: event.outcome,
      dataSource: readableSource(event.dataSource) || "Workspace",
      details: conciseDetails(event),
    });
  }

  for (const [id, group] of grouped) {
    rows.push({
      id,
      timestamp: group.latest,
      action: group.action,
      outcome: group.outcome,
      dataSource: group.source || "Workspace",
      details: `${group.records} records processed across ${group.count} sync ${group.count === 1 ? "event" : "events"}.`,
    });
  }

  return rows.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
}

function conciseDetails(event: {
  details: string | null;
  affectedContact: { fullName: string | null; primaryEmail: string | null } | null;
}) {
  const contact = event.affectedContact?.fullName ?? event.affectedContact?.primaryEmail;
  if (contact) return `Affected contact: ${contact}.`;
  return event.details ? redactImplementationDetails(event.details) : "No additional public details.";
}

function extractRecordCount(details: string | null) {
  const match = details?.match(/(\d+)\s+(?:Gmail messages|contact records|events|records)/i);
  return match ? Number.parseInt(match[1] ?? "0", 10) : 0;
}

function readableSource(source: string | null) {
  if (!source) return "";
  return source.replaceAll("_", " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

function redactImplementationDetails(details: string) {
  return details.replace(/c[a-z0-9]{20,}/gi, "[internal id]");
}
