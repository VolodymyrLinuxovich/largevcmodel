export const GOOGLE_SIGN_IN_SCOPES = ["openid", "email", "profile"];

export const GOOGLE_SERVICE_SCOPES = {
  gmail: [
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.compose",
  ],
  contacts: ["https://www.googleapis.com/auth/contacts.readonly"],
  calendar: [
    "https://www.googleapis.com/auth/calendar.events.readonly",
    "https://www.googleapis.com/auth/calendar.freebusy",
    "https://www.googleapis.com/auth/calendar.events",
  ],
} as const;

export type GoogleConnectService = keyof typeof GOOGLE_SERVICE_SCOPES;
export type GoogleOAuthService = GoogleConnectService | "signin";

export function allGoogleWorkspaceScopes() {
  return Array.from(new Set([...GOOGLE_SIGN_IN_SCOPES, ...Object.values(GOOGLE_SERVICE_SCOPES).flat()]));
}

export function scopesForService(service: GoogleOAuthService) {
  if (service === "signin") return allGoogleWorkspaceScopes();
  return Array.from(new Set([...GOOGLE_SIGN_IN_SCOPES, ...GOOGLE_SERVICE_SCOPES[service]]));
}

export function serviceLabel(service: GoogleOAuthService) {
  if (service === "gmail") return "Gmail";
  if (service === "contacts") return "Google Contacts";
  if (service === "calendar") return "Google Calendar";
  return "Google sign-in";
}

export function permissionExplanation(service: GoogleConnectService) {
  if (service === "gmail") {
    return "Read metadata and relevant message snippets, create Gmail drafts after review, and send only after explicit approval.";
  }
  if (service === "contacts") {
    return "Read contact records from Google Contacts so LargeVCModel can normalize names, emails, roles, organizations, notes, and groups.";
  }
  return "Read events, check availability, and create calendar events only after explicit confirmation.";
}
