import Link from "next/link";
import { IntegrationService } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { prisma } from "@/lib/prisma";
import { getWorkspaceData, integrationConnected } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { q = "" } = await searchParams;
  const connected = integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) || integrationConnected(data, IntegrationService.GMAIL);
  const contacts = connected
    ? await prisma.contact.findMany({
        where: q
          ? {
              userId: data.user.id,
              OR: [
                { fullName: { contains: q, mode: "insensitive" } },
                { primaryEmail: { contains: q, mode: "insensitive" } },
                { organization: { contains: q, mode: "insensitive" } },
                { title: { contains: q, mode: "insensitive" } },
                { notes: { contains: q, mode: "insensitive" } },
              ],
            }
          : { userId: data.user.id },
        include: {
          fitScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
        },
        orderBy: [{ relationshipStrength: "desc" }, { lastInteractionAt: "desc" }],
        take: 100,
      })
    : [];

  return (
    <PageFrame>
      <HeroHeader
        eyebrow="NETWORK / CONTACTS"
        title="Search real relationships."
        body="Unified profiles are assembled from Google Contacts, Gmail conversation metadata, Calendar events, user notes, and sourced public research. Missing fields stay blank."
        actions={<Button asChild variant="outline"><Link href="/settings">Manage Integrations</Link></Button>}
      />
      <Section
        title="Contact index"
        aside={
          <form className="flex w-full gap-2 lg:w-[520px]">
            <Input name="q" defaultValue={q} placeholder="Search names, emails, companies, notes" aria-label="Search contacts" />
            <Button type="submit" variant="outline">Search</Button>
          </form>
        }
      >
        {!connected ? (
          <EmptyState title="No contact source connected" body="Connect Google Contacts or Gmail to populate the contact index. LargeVCModel will not create sample contacts." action={<Button asChild><Link href="/settings">Connect Sources</Link></Button>} />
        ) : contacts.length ? (
          <div className="overflow-x-auto border-y border-border">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b border-border font-mono text-[0.68rem] uppercase tracking-[0.08em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Relationship</th>
                  <th className="px-4 py-3">Interactions</th>
                  <th className="px-4 py-3">Last interaction</th>
                  <th className="px-4 py-3">Fit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contacts.map((contact) => (
                  <tr key={contact.id} className="transition-colors hover:text-primary">
                    <td className="px-4 py-3">
                      <Link href={`/contacts/${contact.id}`} className="font-semibold underline-offset-4 hover:underline">
                        {contact.fullName ?? "Unnamed contact"}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{[contact.title, contact.organization].filter(Boolean).join(" / ") || "Unavailable"}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{contact.primaryEmail ?? "Unavailable"}</td>
                    <td className="px-4 py-3"><Badge variant="muted">{contact.source.replaceAll("_", " ")}</Badge></td>
                    <td className="px-4 py-3">{contact.relationshipStrength ?? "N/A"}</td>
                    <td className="px-4 py-3">{contact.interactionCount}</td>
                    <td className="px-4 py-3"><Timestamp value={contact.lastInteractionAt} /></td>
                    <td className="px-4 py-3">{contact.fitScores[0]?.overall ?? "N/A"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No results found" body={q ? "No connected contact records match the current search." : "The connected account has not produced contact records yet. Run sync from Settings."} />
        )}
      </Section>
    </PageFrame>
  );
}
