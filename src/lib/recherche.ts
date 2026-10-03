// ============================================================
//  RECHERCHE RAPIDE D'UN DOSSIER (v13.35) — barre du tableau de bord.
//
//  Une seule saisie retrouve un dossier par : n° de sinistre, nom du
//  client, immatriculation, véhicule, assureur, cabinet / nom de l'expert,
//  n° de police, téléphone du client.
//  - accents et majuscules ignorés (« eleonore » trouve « Éléonore ») ;
//  - immatriculation et n° saisis SANS tirets ni espaces (« ab123cd »
//    trouve « AB-123-CD ») ;
//  - plusieurs mots = tous doivent être présents (« clio dupont »).
//  Classement : correspondance exacte > début de champ > contenu, et à
//  pertinence égale les dossiers ACTIFS passent avant les clôturés.
// ============================================================

import type { Dossier } from "@/lib/types";
import { estActif } from "@/lib/format";

/** minuscules, sans accents, espaces simplifiés. */
export function normaliserRecherche(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Version « compacte » : lettres et chiffres seulement (immat, n°, tél). */
function compact(s: string): string {
  return s.replace(/[^a-z0-9]/g, "");
}

function champsRecherchables(d: Dossier): string[] {
  return [
    d.numero_sinistre,
    d.immatriculation,
    d.client_nom,
    d.marque_modele,
    d.assureur,
    d.cabinet_expert,
    d.expert_nom,
    d.numero_police,
    d.client_tel ?? null,
    d.numero_serie,
  ]
    .filter(Boolean)
    .map((v) => normaliserRecherche(v as string));
}

/** Score d'un mot dans un champ (0 = absent). */
function scoreMot(mot: string, champ: string): number {
  const motC = compact(mot);
  const champC = compact(champ);
  if (champ === mot || (motC && champC === motC)) return 100;
  if (champ.startsWith(mot) || (motC && champC.startsWith(motC))) return 60;
  if (champ.split(" ").some((w) => w.startsWith(mot))) return 45;
  if (champ.includes(mot) || (motC.length >= 2 && champC.includes(motC))) return 25;
  return 0;
}

export type ResultatRecherche = { dossier: Dossier; score: number };

/** Dossiers correspondant à `q`, du plus pertinent au moins pertinent. */
export function rechercherDossiers(dossiers: Dossier[], q: string, limite = 8): ResultatRecherche[] {
  const mots = normaliserRecherche(q).split(" ").filter(Boolean);
  if (mots.length === 0) return [];
  const res: ResultatRecherche[] = [];
  for (const d of dossiers) {
    const champs = champsRecherchables(d);
    let total = 0;
    let ok = true;
    for (const mot of mots) {
      const meilleur = Math.max(0, ...champs.map((c) => scoreMot(mot, c)));
      if (meilleur === 0) {
        ok = false;
        break;
      }
      total += meilleur;
    }
    if (!ok) continue;
    if (estActif(d.statut)) total += 10;
    res.push({ dossier: d, score: total });
  }
  res.sort(
    (a, b) =>
      b.score - a.score ||
      String(b.dossier.created_at || "").localeCompare(String(a.dossier.created_at || ""))
  );
  return res.slice(0, limite);
}
