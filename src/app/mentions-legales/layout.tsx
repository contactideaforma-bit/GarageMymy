import { metaPage } from "@/lib/seo";

// SEO (v13.45) : title, description, canonical et aperçu de partage.
export const metadata = metaPage({
  titre: "Mentions légales du logiciel carrosserie | My Easy Auto",
  description:
    "Mentions légales de My Easy Auto, logiciel de gestion pour carrosseries : éditeur, hébergeur, contact et propriété intellectuelle. Consultez-les ici.",
  chemin: "/mentions-legales",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
