import "server-only";

import type { PrismaClient } from "@prisma/client";
import { audit } from "@/lib/audit";
import { refreshRelationshipHealth } from "./relationship-health-service";

/**
 * Recomputes health for contacts touched by a sync page. Imported records are already
 * committed, so a health failure is reported (log + audit event) instead of failing the sync.
 */
export async function refreshRelationshipHealthAfterSync(
  prisma: PrismaClient,
  userId: string,
  contactIds: string[],
  dataSource: string,
) {
  if (!contactIds.length) return null;
  try {
    return await refreshRelationshipHealth(prisma, userId, { contactIds });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown relationship health failure";
    console.error("Relationship health refresh failed after sync", { userId, dataSource, message });
    await audit(prisma, {
      userId,
      actor: "Relationship health engine",
      actorType: "SYSTEM",
      action: "Relationship health refresh failed",
      outcome: "failed",
      dataSource,
      details: `${contactIds.length} contacts were not recalculated: ${message}`,
    });
    return null;
  }
}
