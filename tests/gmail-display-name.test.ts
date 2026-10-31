import { describe, expect, it } from "vitest";
import { displayNameFromHeaders } from "@/lib/google/gmail";

describe("Gmail display names", () => {
  it("reads a plain name before the address", () => {
    expect(displayNameFromHeaders(["Ada Lovelace <ada@example.com>"], "ada@example.com")).toBe("Ada Lovelace");
  });

  it("reads a quoted name that contains a comma", () => {
    expect(displayNameFromHeaders(['"Lovelace, Ada" <ada@example.com>'], "ada@example.com")).toBe("Lovelace, Ada");
  });

  it("picks the name of the matching address in a list", () => {
    const to = 'Charles Babbage <charles@example.com>, "Ada \\"A.\\" Lovelace" <Ada@Example.com>';
    expect(displayNameFromHeaders([to], "ada@example.com")).toBe('Ada "A." Lovelace');
  });

  it("looks through every header until it finds the address", () => {
    expect(
      displayNameFromHeaders(["Me <me@example.com>", null, "Ada Lovelace <ada@example.com>"], "ada@example.com"),
    ).toBe("Ada Lovelace");
  });

  it("returns null for a bare address or a name equal to the address", () => {
    expect(displayNameFromHeaders(["ada@example.com"], "ada@example.com")).toBeNull();
    expect(displayNameFromHeaders(['"ada@example.com" <ada@example.com>'], "ada@example.com")).toBeNull();
    expect(displayNameFromHeaders(["<ada@example.com>"], "ada@example.com")).toBeNull();
  });

  it("does not match an address that only shares a suffix", () => {
    expect(displayNameFromHeaders(["Bad Actor <xada@example.com>"], "ada@example.com")).toBeNull();
    expect(displayNameFromHeaders(["Other <ada@example.co>"], "ada@example.com")).toBeNull();
  });
});
