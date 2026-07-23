import Link from "next/link";
import { ContactSource, IntegrationService, Prisma } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState, HeroHeader, PageFrame, Section, SignInPanel, Timestamp } from "@/components/workspace/core";
import { prisma } from "@/lib/prisma";
import { getWorkspaceData, integrationConnected } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const pageSize = 25;

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; source?: string; recency?: string; sort?: string; page?: string; includeAutomated?: string }>;
}) {
  const data = await getWorkspaceData();
  if (!data.user) return <SignInPanel data={data} />;
  const { q = "", source = "", recency = "", sort = "relationship", page = "1", includeAutomated = "" } = await searchParams;
  const currentPage = Math.max(1, Number.parseInt(page, 10) || 1);
  const showAutomated = includeAutomated === "true";
  const connected = integrationConnected(data, IntegrationService.GOOGLE_CONTACTS) || integrationConnected(data, IntegrationService.GMAIL);
  const sourceFilter = Object.values(ContactSource).includes(source as ContactSource) ? (source as ContactSource) : undefined;
  const recencyDate =
    recency === "30"
      ? new Date(Date.now() - 30 * 86_400_000)
      : recency === "90"
        ? new Date(Date.now() - 90 * 86_400_000)
        : recency === "365"
          ? new Date(Date.now() - 365 * 86_400_000)
          : undefined;
  const where: Prisma.ContactWhereInput = {
    userId: data.user.id,
    ...(sourceFilter ? { source: sourceFilter } : {}),
    ...(recencyDate ? { lastInteractionAt: { gte: recencyDate } } : {}),
    ...(showAutomated ? {} : { NOT: automatedContactSignals() }),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" } },
            { primaryEmail: { contains: q, mode: "insensitive" } },
            { organization: { contains: q, mode: "insensitive" } },
            { title: { contains: q, mode: "insensitive" } },
            { notes: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const orderBy: Prisma.ContactOrderByWithRelationInput[] =
    sort === "last"
      ? [{ lastInteractionAt: "desc" }, { relationshipStrength: "desc" }]
      : sort === "name"
        ? [{ fullName: "asc" }, { primaryEmail: "asc" }]
        : [{ relationshipStrength: "desc" }, { lastInteractionAt: "desc" }];
  const [contacts, totalContacts] = connected
    ? await Promise.all([
        prisma.contact.findMany({
          where,
          include: {
            fitScores: { orderBy: { calculatedAt: "desc" }, take: 1 },
          },
          orderBy,
          skip: (currentPage - 1) * pageSize,
          take: pageSize,
        }),
        prisma.contact.count({ where }),
      ])
    : [[], 0];
  const totalPages = Math.max(1, Math.ceil(totalContacts / pageSize));

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
          <form className="grid w-full gap-2 md:grid-cols-[1fr_150px_150px_150px_auto] lg:w-[980px]">
            <Input name="q" defaultValue={q} placeholder="Search names, emails, companies, notes" aria-label="Search contacts" />
            <Select name="source" defaultValue={source} aria-label="Filter by source">
              <option value="">All sources</option>
              {Object.values(ContactSource).map((item) => (
                <option key={item} value={item}>
                  {item.replaceAll("_", " ")}
                </option>
              ))}
            </Select>
            <Select name="recency" defaultValue={recency} aria-label="Filter by interaction recency">
              <option value="">Any recency</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="365">Last year</option>
            </Select>
            <Select name="sort" defaultValue={sort} aria-label="Sort contacts">
              <option value="relationship">Relationship</option>
              <option value="last">Last interaction</option>
              <option value="name">Name</option>
            </Select>
            <Button type="submit" variant="outline">Search</Button>
            <label className="flex items-center gap-2 text-xs leading-5 text-muted-foreground md:col-span-full">
              <input
                type="checkbox"
                name="includeAutomated"
                value="true"
                defaultChecked={showAutomated}
                className="h-3.5 w-3.5 accent-primary"
              />
              Include automated and organization senders
            </label>
          </form>
        }
      >
        {!connected ? (
          <EmptyState title="No contact source connected" body="Connect Google Contacts or Gmail to populate the contact index. LargeVCModel will not create contacts without connected evidence." action={<Button asChild><Link href="/settings">Connect Sources</Link></Button>} />
        ) : contacts.length ? (
          <>
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
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <p className="font-mono text-[0.68rem] uppercase tracking-[0.12em] text-muted-foreground">
                {totalContacts} records / page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <Button asChild variant="outline" size="sm" disabled={currentPage <= 1}>
                  <Link href={contactsPageHref({ q, source, recency, sort, includeAutomated, page: currentPage - 1 })}>Previous</Link>
                </Button>
                <Button asChild variant="outline" size="sm" disabled={currentPage >= totalPages}>
                  <Link href={contactsPageHref({ q, source, recency, sort, includeAutomated, page: currentPage + 1 })}>Next</Link>
                </Button>
              </div>
            </div>
          </>
        ) : (
          <EmptyState title="No results found" body={q ? "No connected contact records match the current search." : "The connected account has not produced contact records yet. Run sync from Settings."} />
        )}
      </Section>
    </PageFrame>
  );
}

function automatedContactSignals(): Prisma.ContactWhereInput[] {
  const genericLocalParts = [
    "alerts",
    "billing",
    "contact",
    "digest",
    "follow-suggestions",
    "hello",
    "info",
    "marketing",
    "newsletter",
    "news",
    "no-reply",
    "noreply",
    "notifications",
    "receipts",
    "support",
    "team",
    "updates",
  ];

  return [
    ...genericLocalParts.map((localPart) => ({
      primaryEmail: { startsWith: `${localPart}@`, mode: "insensitive" as const },
    })),
    { fullName: null, organization: null, title: null, source: ContactSource.GMAIL },
  ];
}

function contactsPageHref(input: { q: string; source: string; recency: string; sort: string; includeAutomated: string; page: number }) {
  const params = new URLSearchParams();
  if (input.q) params.set("q", input.q);
  if (input.source) params.set("source", input.source);
  if (input.recency) params.set("recency", input.recency);
  if (input.sort && input.sort !== "relationship") params.set("sort", input.sort);
  if (input.includeAutomated === "true") params.set("includeAutomated", input.includeAutomated);
  if (input.page > 1) params.set("page", String(input.page));
  const query = params.toString();
  return query ? `/contacts?${query}` : "/contacts";
}
