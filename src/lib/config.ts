export function appUrl() {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/+$/, "") || "http://localhost:3000";
}

export function isGoogleOAuthConfigured() {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

export function getResearchProviderName() {
  return process.env.RESEARCH_PROVIDER || "none";
}

export function requiredServerEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}
