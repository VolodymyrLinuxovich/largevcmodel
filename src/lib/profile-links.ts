type TrackedProfile = {
  websiteUrl: string | null;
  socialLinks: unknown;
  user: {
    products: Array<{
      websiteUrl: string | null;
      demoUrl: string | null;
      repositoryUrl: string | null;
    }>;
  };
};

export function trackedProfileTarget(profile: TrackedProfile, linkType: string) {
  const socialLinks =
    profile.socialLinks && typeof profile.socialLinks === "object" && !Array.isArray(profile.socialLinks)
      ? (profile.socialLinks as Record<string, unknown>)
      : {};
  const product = profile.user.products[0];
  const candidates: Record<string, unknown> = {
    website: profile.websiteUrl,
    linkedin: socialLinks.linkedin,
    github: socialLinks.github,
    x: socialLinks.x,
    product_website: product?.websiteUrl,
    product_demo: product?.demoUrl,
    repository: product?.repositoryUrl,
  };
  const value = candidates[linkType];
  if (typeof value !== "string") return null;

  try {
    const target = new URL(value);
    return target.protocol === "http:" || target.protocol === "https:" ? target : null;
  } catch {
    return null;
  }
}
