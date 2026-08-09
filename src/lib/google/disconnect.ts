import "server-only";

import { IntegrationService, type PrismaClient } from "@prisma/client";

export function importedDataSetsForService(service: IntegrationService) {
  if (service === IntegrationService.GMAIL) return ["contacts", "gmail"] as const;
  if (service === IntegrationService.GOOGLE_CALENDAR) return ["calendar"] as const;
  return ["contacts"] as const;
}

export async function deleteImportedDataForIntegration(
  prisma: PrismaClient,
  userId: string,
  integration: { id: string; service: IntegrationService },
) {
  let deleted = 0;
  for (const dataSet of importedDataSetsForService(integration.service)) {
    if (dataSet === "contacts") {
      const result = await prisma.contact.deleteMany({ where: { userId, sourceIntegrationId: integration.id } });
      deleted += result.count;
    } else if (dataSet === "gmail") {
      const result = await prisma.gmailThread.deleteMany({ where: { userId } });
      deleted += result.count;
    } else {
      const result = await prisma.calendarEvent.deleteMany({ where: { userId } });
      deleted += result.count;
    }
  }
  return deleted;
}
