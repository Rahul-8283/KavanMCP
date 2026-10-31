import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A static export: `next build` writes the whole site to out/, and any static host can serve it.
  output: "export",
  // The default image loader needs a server. Images are optimised once, by scripts/optimize-screenshots.mjs.
  images: { unoptimized: true },
  // cacheComponents and partialPrefetching are left off on purpose. They are about caching at request time, a static
  // export has no server to do that, and cacheComponents rejects the `force-static` that robots.ts and sitemap.ts
  // need under `output: "export"`.
  experimental: {
    agentFeedback: true,
  },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
