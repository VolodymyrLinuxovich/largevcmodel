import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {},
  outputFileTracingIncludes: {
    "/*": ["./prisma/demo-template.db"],
  },
};

export default nextConfig;
