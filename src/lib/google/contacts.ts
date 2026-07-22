import "server-only";

import { ContactSource, IntegrationService, PrismaClient } from "@prisma/client";
import { googleFetch, getConnectedIntegration } from "./api";
import { audit } from "@/lib/audit";

type PeopleConnectionsResponse = {
  connections?: Array<{
    resourceName?: string;
    etag?: string;
    names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
    emailAddresses?: Array<{ value?: string; metadata?: { primary?: boolean; verified?: boolean } }>;
    phoneNumbers?: Array<{ value?: string }>;
    organizations?: Array<{ name?: string; title?: string; current?: boolean }>;
    photos?: Array<{ url?: string; metadata?: { primary?: boolean } }>;
    biographies?: Array<{ value?: string }>;
    memberships?: Array<{ contactGroupMembership?: { contactGroupResourceName?: string } }>;
    metadata?: unknown;
  }>;
  nextPageToken?: string;
};

function lowerEmail(email?: string | null) {
  return email?.trim().toLowerCase() || null;
}

export async function syncGoogleContacts(prisma: PrismaClient, userId: string) {
  const integration = await getConnectedIntegration(prisma, userId, IntegrationService.GOOGLE_CONTACTS);
  await prisma.integration.update({
    where: { id: integration.id },
    data: { syncStatus: "syncing", lastError: null },
  });

  let pageToken: string | undefined;
  let imported = 0;

  try {
    do {
      const url = new URL("https://people.googleapis.com/v1/people/me/connections");
      url.searchParams.set("personFields", "names,emailAddresses,phoneNumbers,organizations,photos,biographies,memberships,metadata");
      url.searchParams.set("pageSize", "200");
      if (pageToken) url.searchParams.set("pageToken", pageToken);

      const payload = await googleFetch<PeopleConnectionsResponse>(
        prisma,
        userId,
        IntegrationService.GOOGLE_CONTACTS,
        url.toString(),
      );

      for (const person of payload.connections ?? []) {
        const emails = Array.from(
          new Set((person.emailAddresses ?? []).map((email) => lowerEmail(email.value)).filter(Boolean) as string[]),
        );
        const primaryEmail =
          lowerEmail(person.emailAddresses?.find((email) => email.metadata?.primary)?.value) ?? emails[0] ?? null;
        const organization = person.organizations?.find((item) => item.current)?.name ?? person.organizations?.[0]?.name ?? null;
        const title = person.organizations?.find((item) => item.current)?.title ?? person.organizations?.[0]?.title ?? null;
        const fullName = person.names?.find((name) => name.displayName)?.displayName ?? person.names?.[0]?.displayName ?? primaryEmail;
        const providerId = person.resourceName ?? primaryEmail ?? undefined;

        if (!providerId && !primaryEmail) continue;

        const existingByEmail = primaryEmail
          ? await prisma.contact.findUnique({ where: { userId_primaryEmail: { userId, primaryEmail } } })
          : null;

        const where = existingByEmail
          ? { id: existingByEmail.id }
          : { userId_source_providerId: { userId, source: ContactSource.GOOGLE_CONTACTS, providerId: providerId || primaryEmail || "" } };

        const contact = await prisma.contact.upsert({
          where,
          create: {
            userId,
            sourceIntegrationId: integration.id,
            source: ContactSource.GOOGLE_CONTACTS,
            providerId,
            fullName,
            primaryEmail,
            emails,
            phones: (person.phoneNumbers ?? []).map((phone) => phone.value).filter(Boolean) as string[],
            organization,
            title,
            profileImageUrl: person.photos?.find((photo) => photo.metadata?.primary)?.url ?? person.photos?.[0]?.url ?? null,
            notes: person.biographies?.[0]?.value ?? null,
            groups: (person.memberships ?? [])
              .map((membership) => membership.contactGroupMembership?.contactGroupResourceName)
              .filter(Boolean) as string[],
            metadata: person.metadata as object,
          },
          update: {
            sourceIntegrationId: integration.id,
            providerId,
            fullName,
            emails,
            phones: (person.phoneNumbers ?? []).map((phone) => phone.value).filter(Boolean) as string[],
            organization,
            title,
            profileImageUrl: person.photos?.find((photo) => photo.metadata?.primary)?.url ?? person.photos?.[0]?.url ?? null,
            notes: person.biographies?.[0]?.value ?? null,
            groups: (person.memberships ?? [])
              .map((membership) => membership.contactGroupMembership?.contactGroupResourceName)
              .filter(Boolean) as string[],
            metadata: person.metadata as object,
          },
        });
        await prisma.relationshipEdge.upsert({
          where: {
            userId_fromNodeId_toNodeId_relationship_source: {
              userId,
              fromNodeId: userId,
              toNodeId: contact.id,
              relationship: "Direct contact record",
              source: "Google Contacts",
            },
          },
          create: {
            userId,
            fromNodeId: userId,
            fromNodeLabel: integration.accountEmail,
            fromNodeType: "user",
            toNodeId: contact.id,
            toNodeLabel: contact.fullName ?? contact.primaryEmail,
            toNodeType: "contact",
            relationship: "Direct contact record",
            strength: 2,
            evidence: "The contact exists in the connected Google Contacts account.",
            source: "Google Contacts",
            sourceRecordId: providerId,
          },
          update: {
            toNodeLabel: contact.fullName ?? contact.primaryEmail,
            evidence: "The contact exists in the connected Google Contacts account.",
            sourceRecordId: providerId,
          },
        });
        imported += 1;
      }

      pageToken = payload.nextPageToken;
    } while (pageToken);

    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: "idle", lastSyncedAt: new Date(), lastError: null },
    });
    await audit(prisma, {
      userId,
      actor: "Google Contacts sync",
      action: "Contact imported",
      outcome: "completed",
      dataSource: "Google Contacts",
      details: `${imported} contact records processed from People API.`,
    });
    return { imported };
  } catch (error) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: "error", lastError: error instanceof Error ? error.message : "Unknown sync error" },
    });
    throw error;
  }
}
