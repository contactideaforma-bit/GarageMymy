import type { MetadataRoute } from "next";
import { ROUTES_PRIVEES, SITE_URL } from "@/lib/seo";

// robots.txt (v13.45) : la vitrine est explorable, l'appli connectée non.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ROUTES_PRIVEES }],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
