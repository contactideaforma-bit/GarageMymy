"use client";

import PiecesRecherche from "@/components/expert/PiecesRecherche";
import { EnTete } from "@/components/expert/ui";

export default function PagePiecesExpert() {
  return (
    <div className="space-y-4">
      <EnTete titre="Recherche de pièces & prix" sousTitre="Référence, fourchettes de prix (origine, neuf, réemploi) et liens directs vers les catalogues. Depuis un dossier, la pièce s'ajoute au chiffrage en un clic." />
      <PiecesRecherche />
    </div>
  );
}
