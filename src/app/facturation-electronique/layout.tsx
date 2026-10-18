import { metaPage } from "@/lib/seo";

// SEO (v13.45) : title, description, canonical et aperçu de partage.
export const metadata = metaPage({
  titre: "Facturation électronique carrosserie | My Easy Auto",
  description:
    "Réforme de la facturation électronique : ce qui change pour votre carrosserie en 2026-2027 et comment My Easy Auto prépare vos factures Factur-X.",
  chemin: "/facturation-electronique",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
