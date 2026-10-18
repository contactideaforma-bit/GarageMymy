import { metaPage } from "@/lib/seo";

// SEO (v13.45) : title, description, canonical et aperçu de partage.
export const metadata = metaPage({
  titre: "Abonnement logiciel de gestion carrosserie | My Easy Auto",
  description:
    "Abonnez votre carrosserie à My Easy Auto en quelques minutes : formule au choix, contrat signé en ligne, paiement mensuel ou annuel. Inscrivez-vous.",
  chemin: "/inscription",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
