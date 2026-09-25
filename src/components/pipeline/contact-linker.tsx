"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { HealthStateBadge } from "@/components/relationships/health-state-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import type { RelationshipHealthState } from "@/lib/domain/relationship-health";
import { OPPORTUNITY_CONTACT_ROLES } from "@/lib/pipeline/schemas";
import { FormError } from "./form-status";
import { enumLabel } from "./labels";
import { requestJson } from "./request-json";

export type LinkedPerson = {
  contactId: string;
  name: string;
  detail: string | null;
  role: string;
  healthState: RelationshipHealthState | null;
  healthScore: number | null;
};

type SearchResult = { id: string; fullName: string | null; primaryEmail: string | null; organization: string | null };

export function ContactLinker({ opportunityId, linked }: { opportunityId: string; linked: LinkedPerson[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [role, setRole] = useState<string>("FOUNDER");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending("search");
    try {
      const payload = await requestJson<{ contacts: SearchResult[] }>(`/api/contacts/search?q=${encodeURIComponent(query.trim())}`, { method: "GET" });
      const linkedIds = new Set(linked.map((person) => person.contactId));
      setResults(payload.contacts.filter((contact) => !linkedIds.has(contact.id)).slice(0, 10));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Search failed.");
    } finally {
      setPending(null);
    }
  }

  async function mutate(method: "POST" | "DELETE", contactId: string) {
    setError(null);
    setPending(contactId);
    try {
      await requestJson(`/api/opportunities/${opportunityId}/contacts`, { method, body: method === "POST" ? { contactId, role } : { contactId } });
      setResults(null);
      setQuery("");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Update failed.");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="space-y-5">
      {linked.length ? (
        <ul className="divide-y divide-border border-y border-border">
          {linked.map((person) => (
            <li key={person.contactId} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <Link href={`/contacts/${person.contactId}`} className="text-sm font-semibold underline-offset-4 hover:underline">
                  {person.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {enumLabel(person.role)}
                  {person.detail ? ` / ${person.detail}` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <HealthStateBadge state={person.healthState} score={person.healthScore} />
                <Button type="button" variant="ghost" size="sm" disabled={pending === person.contactId} onClick={() => mutate("DELETE", person.contactId)} aria-label={`Unlink ${person.name}`}>
                  Unlink
                </Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">No people linked yet. Link founders, introducers or co-investors from your contacts.</p>
      )}

      <form onSubmit={search} className="grid gap-2 sm:grid-cols-[1fr_160px_auto]" role="search" aria-label="Find a contact to link">
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search contacts by name, email or company" aria-label="Contact search" />
        <Select value={role} onChange={(event) => setRole(event.target.value)} aria-label="Role for linked contact">
          {OPPORTUNITY_CONTACT_ROLES.map((item) => (
            <option key={item} value={item}>
              {enumLabel(item)}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="outline" disabled={pending === "search"} aria-busy={pending === "search"}>
          Search
        </Button>
      </form>
      {results ? (
        results.length ? (
          <ul className="divide-y divide-border border-y border-border" aria-label="Contact search results">
            {results.map((contact) => (
              <li key={contact.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 break-words">
                  {contact.fullName ?? contact.primaryEmail ?? "Unnamed contact"}
                  {contact.organization ? <span className="text-muted-foreground"> / {contact.organization}</span> : null}
                </span>
                <Button type="button" size="sm" variant="outline" disabled={pending === contact.id} onClick={() => mutate("POST", contact.id)}>
                  Link as {enumLabel(role)}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">No unlinked contacts match that search.</p>
        )
      ) : null}
      <FormError message={error} />
    </div>
  );
}
