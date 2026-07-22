import "server-only";

import { IntegrationService, IntegrationStatus, PrismaClient } from "@prisma/client";
import { decryptSecret, encryptSecret } from "@/lib/security/encryption";
import { refreshGoogleAccessToken, revokeGoogleToken } from "./oauth";

export class IntegrationMissingError extends Error {
  constructor(service: IntegrationService) {
    super(`${service} integration is not connected`);
    this.name = "IntegrationMissingError";
  }
}

export async function getConnectedIntegration(prisma: PrismaClient, userId: string, service: IntegrationService) {
  const integration = await prisma.integration.findUnique({
    where: { userId_provider_service: { userId, provider: "google", service } },
  });

  if (!integration || integration.status !== IntegrationStatus.CONNECTED) {
    throw new IntegrationMissingError(service);
  }

  return integration;
}

export async function getGoogleAccessToken(prisma: PrismaClient, userId: string, service: IntegrationService) {
  const integration = await getConnectedIntegration(prisma, userId, service);
  if (!integration.accessTokenCiphertext) throw new IntegrationMissingError(service);

  const expiresAt = integration.tokenExpiresAt?.getTime() ?? 0;
  if (expiresAt > Date.now() + 60_000) {
    return decryptSecret(integration.accessTokenCiphertext);
  }

  if (!integration.refreshTokenCiphertext) {
    throw new Error(`${service} integration does not have a refresh token. Reconnect the account.`);
  }

  const refreshToken = decryptSecret(integration.refreshTokenCiphertext);
  const refreshed = await refreshGoogleAccessToken(refreshToken);
  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      accessTokenCiphertext: encryptSecret(refreshed.access_token),
      tokenExpiresAt: refreshed.expires_in ? new Date(Date.now() + refreshed.expires_in * 1000) : null,
      lastError: null,
      status: IntegrationStatus.CONNECTED,
    },
  });

  return refreshed.access_token;
}

export async function googleFetch<T>(
  prisma: PrismaClient,
  userId: string,
  service: IntegrationService,
  url: string,
  init?: RequestInit,
) {
  const token = await getGoogleAccessToken(prisma, userId, service);
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      authorization: `Bearer ${token}`,
      "content-type": init?.body ? "application/json" : "application/json",
    },
  });

  if (response.status === 429) {
    throw new Error("Google API rate limit reached. Retry after the provider window resets.");
  }

  if (!response.ok) {
    throw new Error(`Google API request failed: ${response.status} ${await response.text()}`);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

export async function revokeIntegration(prisma: PrismaClient, userId: string, integrationId: string) {
  const integration = await prisma.integration.findFirst({ where: { id: integrationId, userId } });
  if (!integration) return;

  const encryptedToken = integration.refreshTokenCiphertext ?? integration.accessTokenCiphertext;
  if (encryptedToken) {
    await revokeGoogleToken(decryptSecret(encryptedToken));
  }

  await prisma.integration.update({
    where: { id: integration.id },
    data: {
      status: IntegrationStatus.REVOKED,
      accessTokenCiphertext: null,
      refreshTokenCiphertext: null,
      tokenExpiresAt: null,
      syncStatus: "disconnected",
      disconnectedAt: new Date(),
    },
  });
}
