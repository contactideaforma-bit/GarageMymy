import { metaPage } from "@/lib/seo";

// SEO (v13.48) : la page « Toutes les fonctionnalités » est une page publique indexée.
export const metadata = metaPage({
  titre: "Toutes les fonctionnalités du logiciel carrosserie | My Easy Auto",
  description:
    "Logiciel de gestion complet pour carrosserie : dossiers sinistres, lecture IA des rapports d'expertise, devis et factures, planning, rentabilité, Factur-X, flotte de prêt, recouvrement. Comparatif avec un DMS classique.",
  chemin: "/fonctionnalites",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
