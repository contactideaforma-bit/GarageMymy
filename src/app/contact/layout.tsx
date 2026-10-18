import { metaPage } from "@/lib/seo";

// SEO (v13.45) : title, description, canonical et aperçu de partage.
export const metadata = metaPage({
  titre: "Contact et démo du logiciel carrosserie | My Easy Auto",
  description:
    "Une question sur My Easy Auto ? Demandez une démonstration du logiciel de gestion carrosserie sur vos propres dossiers de sinistres. Réponse rapide.",
  chemin: "/contact",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
