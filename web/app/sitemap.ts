import type { MetadataRoute } from "next";
import { siteUrl } from "@/content/site";

// A static export has no server to answer this at request time, so it is written once at build time
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{ url: `${siteUrl}/`, changeFrequency: "monthly", priority: 1 }];
}
