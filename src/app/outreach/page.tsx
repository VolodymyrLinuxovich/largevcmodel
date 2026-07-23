import Link from "next/link";
import { IntegrationService, OutreachStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ApiActionButton } from "@/components/workspace/api-action-button";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { getWorkspaceData, integrationConnected } from "@/lib/workspace";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function OutreachPage() {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const gmailConnected = integrationConnected(data, IntegrationService.GMAIL);
  const drafts = gmailConnected
    ? await prisma.outreachDraft.findMany({
        where: { userId: data.user.id },
        include: { contact: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      })
    : [];

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="OUTREACH / GMAIL"
        title="Draft with evidence. Send only after approval."
        body="Generated outreach uses stored contact context and sourced claims. The final founder-facing message excludes citation markers; rationale and sources are shown separately."
        actions={<Button asChild variant="outline"><Link href="/contacts">Select Contact</Link></Button>}
      />
      <Section title="Outreach workspace">
        {!gmailConnected ? (
          <EmptyState title="Gmail not connected" body="Connect Gmail to create drafts, review saved Gmail drafts, send approved messages, and track replies. No messages are sent automatically." action={<Button asChild><Link href="/settings">Connect Gmail</Link></Button>} />
        ) : drafts.length ? (
          <div className="divide-y divide-border border-y border-border">
            {drafts.map((draft) => {
              const rationale = draft.rationale ? safeJson(draft.rationale) : null;
              return (
                <div key={draft.id} className="grid gap-5 py-6 xl:grid-cols-[1fr_360px]">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={draft.status === OutreachStatus.SENT ? "success" : draft.status === OutreachStatus.FAILED ? "warning" : "muted"}>
                        {draft.status.replaceAll("_", " ")}
                      </Badge>
                      <span className="font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                        <Timestamp value={draft.updatedAt} />
                      </span>
                    </div>
                    <h2 className="mt-3 text-lg font-semibold">{draft.subject}</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {draft.contact.fullName ?? draft.contact.primaryEmail ?? "Unnamed contact"}
                    </p>
                    <pre className="mt-4 whitespace-pre-wrap border-y border-border bg-background py-4 font-mono text-xs leading-6 text-foreground">
                      {draft.body}
                    </pre>
                  </div>
                  <aside className="space-y-3">
                    <div className="border-y border-border py-4">
                      <p className="eyebrow mb-3">Why personalized</p>
                      <p className="text-xs leading-5 text-muted-foreground">{String(rationale?.summary ?? "No rationale stored.")}</p>
                      {Array.isArray(rationale?.claims) && rationale.claims.length ? (
                        <ul className="mt-3 space-y-2 text-xs leading-5 text-muted-foreground">
                          {rationale.claims.map((claim: { claim: string; sourceTitle: string }, index: number) => (
                            <li key={`${draft.id}-${index}`}>
                              {claim.claim} ({claim.sourceTitle})
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {draft.status === OutreachStatus.AI_GENERATED ? (
                        <ApiActionButton endpoint="/api/outreach/approve" payload={{ draftId: draft.id }} variant="outline" size="sm">Approve</ApiActionButton>
                      ) : null}
                      {draft.status === OutreachStatus.APPROVED ? (
                        <ApiActionButton endpoint="/api/outreach/save-gmail-draft" payload={{ draftId: draft.id }} variant="outline" size="sm">Save Gmail Draft</ApiActionButton>
                      ) : null}
                      {draft.status === OutreachStatus.GMAIL_DRAFT ? (
                        <ApiActionButton endpoint="/api/outreach/send" payload={{ draftId: draft.id, confirmSend: true }} size="sm">Send</ApiActionButton>
                      ) : null}
                    </div>
                  </aside>
                </div>
              );
            })}
          </div>
        ) : (
          <EmptyState title="No outreach records" body="Open a real contact profile and generate a draft from available evidence. LargeVCModel will not create outreach without selected contact context." />
        )}
      </Section>
    </PageFrame>
  );
}

function safeJson(value: string) {
  try {
    return JSON.parse(value) as { summary?: unknown; claims?: unknown };
  } catch {
    return null;
  }
}
