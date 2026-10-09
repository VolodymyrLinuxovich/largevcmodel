import { describe, expect, it } from "vitest";
import { emailsFromHeader, latestMessageDate } from "@/lib/google/gmail";

describe("Gmail thread timestamps", () => {
  it("keeps the newest message date when sync pages arrive out of order", () => {
    const newest = new Date("2026-09-20T12:00:00.000Z");
    const older = new Date("2026-09-19T12:00:00.000Z");

    expect(latestMessageDate(newest, older)).toBe(newest);
    expect(latestMessageDate(older, newest)).toBe(newest);
  });

  it("handles a thread without a previous timestamp", () => {
    const incoming = new Date("2026-09-20T12:00:00.000Z");

    expect(latestMessageDate(null, incoming)).toBe(incoming);
    expect(latestMessageDate(incoming, null)).toBe(incoming);
  });
});

describe("Gmail address headers", () => {
  it("does not split on a comma inside a quoted display name", () => {
    expect(emailsFromHeader('"Doe, John" <john@acme.com>, Jane <jane@acme.com>')).toEqual(["john@acme.com", "jane@acme.com"]);
  });

  it("handles escaped quotes and bare addresses", () => {
    expect(emailsFromHeader('"Smith \\"JS\\", Jr" <js@acme.com>, bob@acme.com')).toEqual(["js@acme.com", "bob@acme.com"]);
  });

  it("returns an empty list for a missing header", () => {
    expect(emailsFromHeader(null)).toEqual([]);
  });
});
