import { metaPage } from "@/lib/seo";

// SEO (v13.45) : title, description, canonical et aperçu de partage.
export const metadata = metaPage({
  titre: "Politique de confidentialité et données | My Easy Auto",
  description:
    "Confidentialité chez My Easy Auto : données collectées, finalités, durée de conservation, hébergement et exercice de vos droits RGPD. Consultez-la.",
  chemin: "/confidentialite",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
