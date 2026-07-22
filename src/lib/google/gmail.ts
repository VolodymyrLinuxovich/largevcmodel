import "server-only";

import { ContactSource, IntegrationService, PrismaClient } from "@prisma/client";
import { googleFetch, getConnectedIntegration } from "./api";
import { audit } from "@/lib/audit";

type GmailListResponse = { messages?: Array<{ id: string; threadId: string }>; nextPageToken?: string };
type GmailMessageResponse = {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: { headers?: Array<{ name: string; value: string }> };
};
type GmailDraftResponse = { id: string; message?: { id?: string; threadId?: string } };

function header(message: GmailMessageResponse, name: string) {
  return message.payload?.headers?.find((item) => item.name.toLowerCase() === name.toLowerCase())?.value;
}

function emailFromHeader(value?: string | null) {
  if (!value) return null;
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).split(",")[0]?.trim().toLowerCase() || null;
}

function emailsFromHeader(value?: string | null) {
  if (!value) return [];
  return value
    .split(",")
    .map((part) => emailFromHeader(part))
    .filter(Boolean) as string[];
}

function gmailThreadUrl(threadId: string) {
  return `https://mail.google.com/mail/u/0/#all/${threadId}`;
}

function base64Url(value: string) {
  return Buffer.from(value).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function rawEmail(input: { to: string; subject: string; body: string; threadId?: string | null }) {
  const lines = [
    `To: ${input.to}`,
    `Subject: ${input.subject}`,
    "Content-Type: text/plain; charset=\"UTF-8\"",
    "MIME-Version: 1.0",
    "",
    input.body,
  ];
  return base64Url(lines.join("\r\n"));
}

export async function syncGmail(prisma: PrismaClient, userId: string, query = "newer_than:365d") {
  const integration = await getConnectedIntegration(prisma, userId, IntegrationService.GMAIL);
  await prisma.integration.update({
    where: { id: integration.id },
    data: { syncStatus: "syncing", lastError: null },
  });

  let imported = 0;
  try {
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("q", query);
    listUrl.searchParams.set("maxResults", "50");
    const list = await googleFetch<GmailListResponse>(prisma, userId, IntegrationService.GMAIL, listUrl.toString());

    for (const item of list.messages ?? []) {
      const messageUrl = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}`);
      messageUrl.searchParams.set("format", "metadata");
      messageUrl.searchParams.append("metadataHeaders", "From");
      messageUrl.searchParams.append("metadataHeaders", "To");
      messageUrl.searchParams.append("metadataHeaders", "Cc");
      messageUrl.searchParams.append("metadataHeaders", "Subject");
      const message = await googleFetch<GmailMessageResponse>(prisma, userId, IntegrationService.GMAIL, messageUrl.toString());

      const fromEmail = emailFromHeader(header(message, "From"));
      const toEmails = emailsFromHeader(header(message, "To"));
      const contactEmail = fromEmail && fromEmail !== integration.accountEmail?.toLowerCase() ? fromEmail : toEmails[0];
      let contactId: string | undefined;
      if (contactEmail) {
        const contact = await prisma.contact.upsert({
          where: { userId_primaryEmail: { userId, primaryEmail: contactEmail } },
          create: {
            userId,
            sourceIntegrationId: integration.id,
            source: ContactSource.GMAIL,
            providerId: contactEmail,
            primaryEmail: contactEmail,
            emails: [contactEmail],
            fullName: contactEmail,
            interactionCount: 1,
            lastInteractionAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
          },
          update: {
            interactionCount: { increment: 1 },
            lastInteractionAt: message.internalDate ? new Date(Number(message.internalDate)) : new Date(),
          },
        });
        contactId = contact.id;
        await prisma.relationshipEdge.upsert({
          where: {
            userId_fromNodeId_toNodeId_relationship_source: {
              userId,
              fromNodeId: userId,
              toNodeId: contact.id,
              relationship: "Email communication",
              source: "Gmail",
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
            relationship: "Email communication",
            strength: Math.min(10, Math.max(3, contact.interactionCount)),
            evidence: "A Gmail message exists between the signed-in account and this contact.",
            source: "Gmail",
            sourceRecordId: message.id,
          },
          update: {
            toNodeLabel: contact.fullName ?? contact.primaryEmail,
            strength: Math.min(10, Math.max(3, contact.interactionCount)),
            evidence: "A Gmail message exists between the signed-in account and this contact.",
            sourceRecordId: message.id,
          },
        });
      }

      const thread = await prisma.gmailThread.upsert({
        where: { userId_providerThreadId: { userId, providerThreadId: message.threadId } },
        create: {
          userId,
          contactId,
          providerThreadId: message.threadId,
          subject: header(message, "Subject") ?? null,
          snippet: message.snippet ?? null,
          threadUrl: gmailThreadUrl(message.threadId),
          labels: message.labelIds ?? [],
          messageCount: 1,
          lastMessageAt: message.internalDate ? new Date(Number(message.internalDate)) : null,
        },
        update: {
          contactId,
          subject: header(message, "Subject") ?? undefined,
          snippet: message.snippet ?? undefined,
          labels: message.labelIds ?? [],
          messageCount: { increment: 1 },
          lastMessageAt: message.internalDate ? new Date(Number(message.internalDate)) : undefined,
        },
      });

      await prisma.gmailMessage.upsert({
        where: { threadId_providerMessageId: { threadId: thread.id, providerMessageId: message.id } },
        create: {
          threadId: thread.id,
          providerMessageId: message.id,
          direction: fromEmail === integration.accountEmail?.toLowerCase() ? "sent" : "received",
          fromEmail,
          toEmails,
          ccEmails: emailsFromHeader(header(message, "Cc")),
          subject: header(message, "Subject") ?? null,
          snippet: message.snippet ?? null,
          internalDate: message.internalDate ? new Date(Number(message.internalDate)) : null,
          messageUrl: gmailThreadUrl(message.threadId),
        },
        update: {
          snippet: message.snippet ?? null,
          internalDate: message.internalDate ? new Date(Number(message.internalDate)) : null,
        },
      });
      imported += 1;
    }

    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: "idle", lastSyncedAt: new Date(), lastError: null },
    });
    await audit(prisma, {
      userId,
      actor: "Gmail sync",
      action: "Email conversation indexed",
      outcome: "completed",
      dataSource: "Gmail",
      details: `${imported} Gmail messages processed as metadata and snippets.`,
    });
    return { imported };
  } catch (error) {
    await prisma.integration.update({
      where: { id: integration.id },
      data: { syncStatus: "error", lastError: error instanceof Error ? error.message : "Unknown Gmail sync error" },
    });
    throw error;
  }
}

export async function createGmailDraft(
  prisma: PrismaClient,
  userId: string,
  input: { to: string; subject: string; body: string; threadId?: string | null },
) {
  const payload = await googleFetch<GmailDraftResponse>(prisma, userId, IntegrationService.GMAIL, "https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
    method: "POST",
    body: JSON.stringify({
      message: {
        raw: rawEmail(input),
        threadId: input.threadId ?? undefined,
      },
    }),
  });
  return payload;
}

export async function sendGmailDraft(prisma: PrismaClient, userId: string, gmailDraftId: string) {
  return googleFetch<GmailDraftResponse>(
    prisma,
    userId,
    IntegrationService.GMAIL,
    "https://gmail.googleapis.com/gmail/v1/users/me/drafts/send",
    {
      method: "POST",
      body: JSON.stringify({ id: gmailDraftId }),
    },
  );
}
