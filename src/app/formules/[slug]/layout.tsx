import type { Metadata } from "next";
import { metaPage } from "@/lib/seo";
import { FICHES, ficheParSlug } from "@/components/vitrine/formules";

// SEO (v13.45) : une fiche par formule, title/description uniques.
export function generateStaticParams() {
  return FICHES.map((f) => ({ slug: f.slug }));
}

export function generateMetadata({ params }: { params: { slug: string } }): Metadata {
  const fiche = ficheParSlug(params.slug);
  if (!fiche) return { title: { absolute: "Formule introuvable | My Easy Auto" }, robots: { index: false } };
  return metaPage({
    titre: `Formule ${fiche.nom} | My Easy Auto`,
    description: `Formule ${fiche.nom} : pour qui, ce qui est inclus et le prix. Comparez les formules du logiciel carrosserie My Easy Auto et abonnez-vous.`,
    chemin: `/formules/${fiche.slug}`,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
