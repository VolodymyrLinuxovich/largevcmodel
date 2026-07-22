import Link from "next/link";
import { Search } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const contacts = await prisma.contact.findMany({
    where: q
      ? {
          OR: [
            { fullName: { contains: q } },
            { sector: { contains: q } },
            { location: { contains: q } },
            { company: { name: { contains: q } } },
            { company: { sector: { contains: q } } },
          ],
        }
      : undefined,
    include: {
      company: true,
      fitScores: { orderBy: { createdAt: "desc" }, take: 1 },
    },
    orderBy: [{ crmStatus: "asc" }, { fullName: "asc" }],
  });

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal">Contacts</h1>
          <p className="mt-2 text-sm text-muted-foreground">Seeded CRM records for fictional founders and companies.</p>
        </div>
        <form className="flex w-full gap-2 lg:w-[420px]">
          <Input name="q" defaultValue={q} placeholder="Search founders, sectors, locations" aria-label="Search contacts" />
          <Button type="submit" variant="outline">
            <Search className="h-4 w-4" aria-hidden="true" />
            Search
          </Button>
        </form>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Founder Database</CardTitle>
          <CardDescription>Internal CRM data is distinct from public research sources.</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="border-b border-border text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-3 pr-4">Founder</th>
                <th className="py-3 pr-4">Company</th>
                <th className="py-3 pr-4">Stage</th>
                <th className="py-3 pr-4">Sector</th>
                <th className="py-3 pr-4">Funding</th>
                <th className="py-3 pr-4">Relationship</th>
                <th className="py-3 pr-4">Fit</th>
                <th className="py-3 pr-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((contact) => (
                <tr key={contact.id} className="border-b border-border last:border-0">
                  <td className="py-3 pr-4">
                    <Link href={`/contacts/${contact.id}`} className="font-medium text-primary hover:underline">
                      {contact.fullName}
                    </Link>
                    <div className="text-xs text-muted-foreground">{contact.role}</div>
                  </td>
                  <td className="py-3 pr-4">{contact.company?.name}</td>
                  <td className="py-3 pr-4">{contact.company?.stage ?? contact.stage}</td>
                  <td className="py-3 pr-4">{contact.company?.sector ?? contact.sector}</td>
                  <td className="py-3 pr-4">
                    {contact.company?.latestFundingRound ?? "Unknown"} {contact.company?.latestFundingAmount ?? ""}
                    <div className="text-xs text-muted-foreground">{formatDate(contact.company?.latestFundingDate)}</div>
                  </td>
                  <td className="py-3 pr-4">{contact.relationshipStrength}/10</td>
                  <td className="py-3 pr-4">{contact.fitScores[0]?.overall ?? "Pending"}</td>
                  <td className="py-3 pr-4">
                    <Badge variant="outline">{contact.crmStatus}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!contacts.length ? <div className="p-6 text-center text-sm text-muted-foreground">No contacts match the current search.</div> : null}
        </CardContent>
      </Card>
    </div>
  );
}
