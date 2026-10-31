import type { MetadataRoute } from "next";
import { siteUrl } from "@/content/site";

// A static export has no server to answer this at request time, so it is written once at build time
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
