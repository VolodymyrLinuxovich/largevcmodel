import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SESSION_COOKIE = "lvc_session";
const OAUTH_STATE_COOKIE = "lvc_oauth_state";

export type SessionPayload = {
  userId: string;
  email: string;
  name?: string | null;
  iat: number;
};

type OAuthStatePayload = {
  state: string;
  service: "signin" | "gmail" | "contacts" | "calendar";
  createdAt: number;
};

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is required");
  return secret;
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url");
}

function encodeSigned<T>(payload: T) {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

function decodeSigned<T>(token: string): T | null {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = sign(body);
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;

  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return decodeSigned<SessionPayload>(token);
}

export function setSessionCookie(response: NextResponse, payload: Omit<SessionPayload, "iat">) {
  response.cookies.set(SESSION_COOKIE, encodeSigned({ ...payload, iat: Date.now() }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}

export function createOAuthState(service: OAuthStatePayload["service"]) {
  const state = randomBytes(24).toString("base64url");
  return { state, token: encodeSigned<OAuthStatePayload>({ state, service, createdAt: Date.now() }) };
}

export function setOAuthStateCookie(response: NextResponse, token: string) {
  response.cookies.set(OAUTH_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 10,
  });
}

export async function verifyOAuthState(state: string) {
  const cookieStore = await cookies();
  const token = cookieStore.get(OAUTH_STATE_COOKIE)?.value;
  if (!token) return null;
  const payload = decodeSigned<OAuthStatePayload>(token);
  if (!payload || payload.state !== state) return null;
  if (Date.now() - payload.createdAt > 10 * 60 * 1000) return null;
  return payload;
}

export function clearOAuthStateCookie(response: NextResponse) {
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
