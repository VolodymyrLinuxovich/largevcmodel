import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const events = await prisma.auditEvent.findMany({
    include: {
      affectedFounder: { include: { company: true } },
      researchRun: true,
    },
    orderBy: { timestamp: "desc" },
    take: 80,
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-normal">Audit Log</h1>
        <p className="mt-2 text-sm text-muted-foreground">Inspect actions, data sources, state changes, approvals, scheduling, and fallbacks without exposing private model reasoning.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Decision and Action Trace</CardTitle>
          <CardDescription>{events.length} recent events.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Timestamp</th>
                <th className="py-3 pr-4">Actor</th>
                <th className="py-3 pr-4">Action</th>
                <th className="py-3 pr-4">Founder</th>
                <th className="py-3 pr-4">Data source</th>
                <th className="py-3 pr-4">Details</th>
                <th className="py-3 pr-4">Score delta</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id} className="border-b border-border align-top last:border-0">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">{formatTime(event.timestamp)}</td>
                  <td className="py-3 pr-4">
                    <div className="font-medium">{event.actor}</div>
                    <div className="text-xs text-muted-foreground">{event.actorType}</div>
                  </td>
                  <td className="py-3 pr-4">{event.action}</td>
                  <td className="py-3 pr-4">{event.affectedFounder?.fullName ?? "-"}</td>
                  <td className="py-3 pr-4">
                    <Badge variant={event.dataSource.includes("internal") ? "warning" : event.dataSource.includes("simulation") ? "muted" : "outline"}>
                      {event.dataSource}
                    </Badge>
                  </td>
                  <td className="max-w-[420px] py-3 pr-4 text-xs leading-5 text-muted-foreground">{event.details}</td>
                  <td className="py-3 pr-4">{event.scoreDelta ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
