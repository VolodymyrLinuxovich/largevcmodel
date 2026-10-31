import { describe, expect, it } from "vitest";
import { profileSaveSchema } from "@/lib/profile";

const profile = { username: "jane_doe" };

describe("profile link validation", () => {
  it("rejects javascript and data links on public profile fields", () => {
    for (const url of ["javascript:alert(document.cookie)", "JavaScript:alert(1)", "data:text/html,<script>alert(1)</script>"]) {
      expect(profileSaveSchema.safeParse({ profile: { ...profile, websiteUrl: url } }).success).toBe(false);
      expect(profileSaveSchema.safeParse({ profile: { ...profile, socialLinks: { linkedin: url } } }).success).toBe(false);
      expect(profileSaveSchema.safeParse({ profile, project: { name: "Atlas", websiteUrl: url } }).success).toBe(false);
      expect(profileSaveSchema.safeParse({ profile, product: { name: "Atlas", demoUrl: url } }).success).toBe(false);
    }
  });

  it("keeps http and https links and blank fields", () => {
    const parsed = profileSaveSchema.parse({
      profile: { ...profile, websiteUrl: "https://jane.dev", avatarUrl: "", socialLinks: { github: "http://github.com/jane" } },
      project: { name: "Atlas", websiteUrl: "HTTPS://atlas.dev/launch" },
    });
    expect(parsed.profile.websiteUrl).toBe("https://jane.dev");
    expect(parsed.profile.avatarUrl).toBeUndefined();
    expect(parsed.profile.socialLinks?.github).toBe("http://github.com/jane");
    expect(parsed.project?.websiteUrl).toBe("HTTPS://atlas.dev/launch");
  });
});
