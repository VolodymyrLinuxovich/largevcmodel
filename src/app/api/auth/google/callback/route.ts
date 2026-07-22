import { IntegrationService, IntegrationStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { clearOAuthStateCookie, setSessionCookie, verifyOAuthState } from "@/lib/auth/session";
import { encryptSecret } from "@/lib/security/encryption";
import { exchangeCodeForTokens, fetchGoogleUserInfo, sessionFromGoogleUser } from "@/lib/google/oauth";

function serviceToIntegration(service: string) {
  if (service === "gmail") return IntegrationService.GMAIL;
  if (service === "contacts") return IntegrationService.GOOGLE_CONTACTS;
  if (service === "calendar") return IntegrationService.GOOGLE_CALENDAR;
  return null;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL("/settings?error=missing_google_oauth_code", request.url));
  }

  const statePayload = await verifyOAuthState(state);
  if (!statePayload) {
    return NextResponse.redirect(new URL("/settings?error=invalid_google_oauth_state", request.url));
  }

  try {
    const tokens = await exchangeCodeForTokens(code, request);
    const googleUser = await fetchGoogleUserInfo(tokens.access_token);
    if (!googleUser.email_verified) {
      return NextResponse.redirect(new URL("/settings?error=google_email_not_verified", request.url));
    }

    const user = await prisma.user.upsert({
      where: { email: googleUser.email.toLowerCase() },
      create: {
        email: googleUser.email.toLowerCase(),
        name: googleUser.name,
        imageUrl: googleUser.picture,
        googleSubject: googleUser.sub,
      },
      update: {
        name: googleUser.name,
        imageUrl: googleUser.picture,
        googleSubject: googleUser.sub,
      },
    });

    await prisma.partner.upsert({
      where: { userId: user.id },
      create: { userId: user.id },
      update: {},
    });

    const integrationService = serviceToIntegration(statePayload.service);
    if (integrationService) {
      const existing = await prisma.integration.findUnique({
        where: { userId_provider_service: { userId: user.id, provider: "google", service: integrationService } },
      });
      await prisma.integration.upsert({
        where: { userId_provider_service: { userId: user.id, provider: "google", service: integrationService } },
        create: {
          userId: user.id,
          provider: "google",
          service: integrationService,
          status: IntegrationStatus.CONNECTED,
          accountEmail: googleUser.email.toLowerCase(),
          providerAccountId: googleUser.sub,
          scopes: tokens.scope?.split(" ") ?? [],
          accessTokenCiphertext: encryptSecret(tokens.access_token),
          refreshTokenCiphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
          tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          syncStatus: "idle",
          disconnectedAt: null,
        },
        update: {
          status: IntegrationStatus.CONNECTED,
          accountEmail: googleUser.email.toLowerCase(),
          providerAccountId: googleUser.sub,
          scopes: tokens.scope?.split(" ") ?? [],
          accessTokenCiphertext: encryptSecret(tokens.access_token),
          refreshTokenCiphertext: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : existing?.refreshTokenCiphertext,
          tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
          syncStatus: "idle",
          lastError: null,
          disconnectedAt: null,
        },
      });
      await audit(prisma, {
        userId: user.id,
        actor: user.email,
        actorType: "USER",
        action: "Integration connected",
        outcome: "completed",
        dataSource: integrationService,
        details: `${statePayload.service} connected via Google OAuth.`,
      });
    } else {
      await audit(prisma, {
        userId: user.id,
        actor: user.email,
        actorType: "USER",
        action: "User signed in",
        outcome: "completed",
        dataSource: "Google OAuth",
      });
    }

    const response = NextResponse.redirect(new URL(integrationService ? "/settings?connected=google" : "/", request.url));
    clearOAuthStateCookie(response);
    setSessionCookie(response, sessionFromGoogleUser(googleUser, user.id));
    return response;
  } catch (callbackError) {
    const response = NextResponse.redirect(new URL(`/settings?error=${encodeURIComponent(callbackError instanceof Error ? callbackError.message : "google_oauth_callback_failed")}`, request.url));
    clearOAuthStateCookie(response);
    return response;
  }
}
