import { describe, expect, it } from "vitest";
import { linkedinUrlVariants } from "@/lib/people/normalization";

describe("linkedinUrlVariants", () => {
  it("covers www, trailing slash and http spellings of the same profile", () => {
    const variants = linkedinUrlVariants("https://linkedin.com/in/jane-doe");
    for (const stored of [
      "https://linkedin.com/in/jane-doe",
      "https://www.linkedin.com/in/jane-doe",
      "https://www.linkedin.com/in/jane-doe/",
      "http://linkedin.com/in/jane-doe/",
    ]) {
      expect(variants).toContain(stored);
    }
  });

  it("finds the stored spelling from a URL with tracking parameters", () => {
    const variants = linkedinUrlVariants("https://www.linkedin.com/in/jane-doe/?utm_source=share#about");
    expect(variants).toContain("https://linkedin.com/in/jane-doe");
    expect(variants).toContain("https://www.linkedin.com/in/jane-doe/");
    expect(variants).toContain("https://www.linkedin.com/in/jane-doe/?utm_source=share#about");
  });

  it("does not widen the lookup to another profile", () => {
    expect(linkedinUrlVariants("https://linkedin.com/in/jane-doe")).not.toContain("https://linkedin.com/in/jane-doe-2");
  });
});
