import { IntegrationService, OutreachStatus, SyncJobStatus, type PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { calendarBookingSchema } from "@/app/api/calendar/book/route";
import { canApproveOutreachDraft } from "@/lib/domain/outreach";
import { deleteImportedDataForIntegration, importedDataSetsForService } from "@/lib/google/disconnect";
import { GOOGLE_SIGN_IN_SCOPES, scopesForService } from "@/lib/google/scopes";
import { trackedProfileTarget } from "@/lib/profile-links";
import { mergePitchDeckExtraction } from "@/lib/startups/pitch-deck";
import { claimSyncJob } from "@/lib/sync/jobs";

describe("security and workflow regressions", () => {
  it("keeps Google sign-in limited to identity scopes", () => {
    expect(scopesForService("signin")).toEqual(GOOGLE_SIGN_IN_SCOPES);
    expect(scopesForService("signin")).not.toContain("https://www.googleapis.com/auth/gmail.compose");
    expect(scopesForService("gmail")).toContain("https://www.googleapis.com/auth/gmail.compose");
  });

  it("deletes only data belonging to the disconnected integration", async () => {
    const contactDelete = vi.fn().mockResolvedValue({ count: 2 });
    const gmailDelete = vi.fn().mockResolvedValue({ count: 3 });
    const calendarDelete = vi.fn().mockResolvedValue({ count: 4 });
    const prisma = {
      contact: { deleteMany: contactDelete },
      gmailThread: { deleteMany: gmailDelete },
      calendarEvent: { deleteMany: calendarDelete },
    } as unknown as PrismaClient;

    expect(importedDataSetsForService(IntegrationService.GMAIL)).toEqual(["contacts", "gmail"]);
    await expect(
      deleteImportedDataForIntegration(prisma, "user", { id: "gmail-integration", service: IntegrationService.GMAIL }),
    ).resolves.toBe(5);
    expect(contactDelete).toHaveBeenCalledWith({ where: { userId: "user", sourceIntegrationId: "gmail-integration" } });
    expect(gmailDelete).toHaveBeenCalledWith({ where: { userId: "user" } });
    expect(calendarDelete).not.toHaveBeenCalled();
  });

  it("allows approval only for newly generated outreach", () => {
    expect(canApproveOutreachDraft(OutreachStatus.AI_GENERATED)).toBe(true);
    expect(canApproveOutreachDraft(OutreachStatus.GMAIL_DRAFT)).toBe(false);
    expect(canApproveOutreachDraft(OutreachStatus.SENT)).toBe(false);
    expect(canApproveOutreachDraft(OutreachStatus.RECEIVED_REPLY)).toBe(false);
  });

  it("resolves tracked links from stored data and rejects unsafe schemes", () => {
    const profile = profileLinksFixture();
    expect(trackedProfileTarget(profile, "website")?.toString()).toBe("https://example.com/");
    expect(trackedProfileTarget(profile, "repository")?.toString()).toBe("https://github.com/example/project");
    expect(trackedProfileTarget({ ...profile, websiteUrl: "javascript:alert(1)" }, "website")).toBeNull();
    expect(trackedProfileTarget({ ...profile, websiteUrl: "data:text/html,test" }, "website")).toBeNull();
    expect(trackedProfileTarget(profile, "unknown")).toBeNull();
  });

  it("rejects calendar events that end before they start", () => {
    const parsed = calendarBookingSchema.safeParse({
      summary: "Investor call",
      attendees: ["investor@example.com"],
      startsAt: "2026-08-10T18:00:00.000Z",
      endsAt: "2026-08-10T17:00:00.000Z",
      confirmCreate: true,
    });

    expect(parsed.success).toBe(false);
  });

  it("scopes pitch-deck extraction lookup to the startup in the route", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const prisma = { pitchDeckExtraction: { findFirst } } as unknown as PrismaClient;

    await expect(
      mergePitchDeckExtraction(prisma, "user", "startup-a", { extractionId: "extraction-b", fields: [] }),
    ).rejects.toThrow("Pitch deck extraction not found.");
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "extraction-b", userId: "user", startupId: "startup-a" } }),
    );
  });

  it("does not process a sync job when another worker wins the claim", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const prisma = { syncJob: { updateMany } } as unknown as PrismaClient;

    await expect(
      claimSyncJob(prisma, { id: "job", status: SyncJobStatus.PENDING, startedAt: null }),
    ).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "job", status: SyncJobStatus.PENDING } }),
    );
  });
});

function profileLinksFixture() {
  return {
    websiteUrl: "https://example.com",
    socialLinks: { linkedin: "https://linkedin.com/in/example" },
    user: {
      products: [
        {
          websiteUrl: "https://product.example.com",
          demoUrl: "https://demo.example.com",
          repositoryUrl: "https://github.com/example/project",
        },
      ],
    },
  };
}
