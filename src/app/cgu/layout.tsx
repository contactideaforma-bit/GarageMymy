import { metaPage } from "@/lib/seo";

// SEO (v13.45) : title, description, canonical et aperçu de partage.
export const metadata = metaPage({
  titre: "Conditions générales d'utilisation | My Easy Auto",
  description:
    "Conditions générales d'utilisation de My Easy Auto, logiciel de gestion des sinistres pour carrosseries : accès, abonnement, données et obligations.",
  chemin: "/cgu",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
