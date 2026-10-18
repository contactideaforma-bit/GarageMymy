import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/seo";
import { FICHES } from "@/components/vitrine/formules";

// sitemap.xml (v13.45) : pages PUBLIQUES uniquement.
export default function sitemap(): MetadataRoute.Sitemap {
  const maj = new Date();
  const page = (
    chemin: string,
    priority: number,
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"] = "monthly"
  ) => ({ url: `${SITE_URL}${chemin}`, lastModified: maj, changeFrequency, priority });
  return [
    page("/", 1, "weekly"),
    ...FICHES.map((f) => page(`/formules/${f.slug}`, 0.8)),
    page("/inscription", 0.8),
    page("/contact", 0.7),
    page("/facturation-electronique", 0.6),
    page("/mentions-legales", 0.2, "yearly"),
    page("/cgu", 0.2, "yearly"),
    page("/confidentialite", 0.2, "yearly"),
  ];
}
