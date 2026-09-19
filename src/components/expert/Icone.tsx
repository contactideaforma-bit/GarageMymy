// PICTOGRAMMES du mode expert (v13.7) — traits SVG monochromes (currentColor),
// aucun emoji : rendu identique sur tous les appareils, sobre et professionnel.

import type { SVGProps } from "react";

const TRAITS: Record<string, string> = {
  tableau: "M3 3h8v8H3zM13 3h8v5h-8zM13 11h8v10h-8zM3 14h8v7H3z",
  dossiers: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  rapport: "M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6",
  recherche: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM16 16l5 5",
  base: "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  cabinet: "M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M8 8h3M8 12h3M8 16h3M3 21h18",
  profil: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  agenda: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4",
  photo: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  galerie: "M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M15 9h.01",
  trombone: "M20 11l-8.5 8.5a5 5 0 0 1-7-7L13 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L14 7",
  telecharger: "M12 4v12M7 11l5 5 5-5M5 20h14",
  importer: "M12 16V4M7 9l5-5 5 5M5 20h14",
  oeil: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  envoyer: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
  ia: "M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM5 16l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM19 15l.8 1.7 1.7.8-1.7.8-.8 1.7-.8-1.7-1.7-.8 1.7-.8z",
  stylo: "M4 20l4-1 11-11-3-3L5 16zM14 7l3 3",
  signature: "M3 18c3 0 4-8 6-8s1 6 3 6 2-4 4-4 1 4 5 4",
  plus: "M12 5v14M5 12h14",
  poubelle: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6",
  utilisateur: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  bouclier: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  outil: "M14.7 6.3a4 4 0 0 0 5 5L13 18l-3-3 6.7-6.7zM4 20l4-4M3 21l1-1",
  calendrier: "M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM4 10h16M8 3v4M16 3v4M8 14h3M13 14h3M8 17h3",
  lieu: "M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11zM12 13a3 3 0 1 0 0-6 3 3 0 0 0 0 6z",
  telephone: "M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z",
  mail: "M3 6h18v12H3zM3 7l9 6 9-6",
  droite: "M5 12h14M13 6l6 6-6 6",
  gauche: "M19 12H5M11 6l-6 6 6 6",
  haut: "M12 19V5M6 11l6-6 6 6",
  externe: "M14 4h6v6M20 4l-9 9M18 13v6H5V6h6",
  menu: "M4 6h16M4 12h16M4 18h16",
  chevron: "M9 6l6 6-6 6",
  facture: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
  sauvegarder: "M5 3h11l3 3v15H5zM8 3v5h7V3M8 14h8v7H8z",
  check: "M5 12l5 5 9-11",
  croix: "M6 6l12 12M18 6L6 18",
  voiture: "M5 13l2-5h10l2 5M4 13h16v5H4zM7 18v2M17 18v2M7.5 15.5h.01M16.5 15.5h.01",
  route: "M6 21l3-18M18 21l-3-18M12 5v2M12 11v2M12 17v2",
  horloge: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  imprimer: "M7 8V3h10v5M5 8h14a2 2 0 0 1 2 2v6h-4v4H7v-4H3v-6a2 2 0 0 1 2-2zM7 14h10",
  document: "M6 3h8l4 4v14H6zM14 3v4h4",
  clone: "M8 8h12v12H8zM4 16V4h12",
};

export type NomIcone = keyof typeof TRAITS;

export default function Icone({ nom, taille = 16, className = "", ...rest }: { nom: NomIcone; taille?: number; className?: string } & Omit<SVGProps<SVGSVGElement>, "className">) {
  const d = TRAITS[nom] || TRAITS.document;
  return (
    <svg
      width={taille}
      height={taille}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      {...rest}
    >
      <path d={d} />
    </svg>
  );
}
