// ====================================================================
//  COURRIERS LA POSTE DÉMATÉRIALISÉS (v13.27) — helpers partagés
//  (navigateur ET serveur : aucune dépendance Supabase ici).
//
//  Un « envoi postal » = un PDF confié à Maileva (La Poste), imprimé et
//  distribué par le facteur : lettre simple ou recommandé AR papier.
// ====================================================================

export type TypeEnvoiPostal = "simple" | "lrar";

export type StatutEnvoiPostal =
  | "brouillon"
  | "soumis"
  | "en_production"
  | "poste"
  | "distribue"
  | "retour"
  | "rejete"
  | "erreur";

export type EnvoiPostal = {
  id: string;
  created_at: string;
  updated_at?: string | null;
  owner_id?: string;
  dossier_id: string | null;
  courrier_id: string | null;
  type: TypeEnvoiPostal;
  objet: string | null;
  destinataire_nom: string | null;
  adresse_lignes: string[];
  pays: string;
  couleur: boolean;
  recto_verso: boolean;
  ar_scanne: boolean;
  pdf_path: string | null;
  environnement: "sandbox" | "production";
  maileva_sending_id: string | null;
  maileva_recipient_id: string | null;
  statut: StatutEnvoiPostal;
  statut_maileva: string | null;
  numero_suivi: string | null;
  historique: { date: string | null; statut: string; detail: string | null }[];
  erreur: string | null;
  soumis_le: string | null;
  maj_statut_le: string | null;
};

export const LIBELLE_TYPE_ENVOI: Record<TypeEnvoiPostal, string> = {
  simple: "Lettre simple",
  lrar: "Recommandé AR",
};

export const STATUT_ENVOI: Record<StatutEnvoiPostal, { label: string; badge: string; aide: string }> = {
  brouillon: { label: "Brouillon", badge: "badge-neutral", aide: "Pas encore transmis à La Poste." },
  soumis: { label: "Transmis", badge: "badge-info", aide: "Reçu par Maileva, en attente d'impression." },
  en_production: { label: "En impression", badge: "badge-info", aide: "Imprimé et mis sous pli par Maileva." },
  poste: { label: "Remis à La Poste", badge: "badge-warn", aide: "Déposé, en cours d'acheminement." },
  distribue: { label: "Distribué", badge: "badge-ok", aide: "Remis au destinataire." },
  retour: { label: "Retour / non réclamé", badge: "badge-danger", aide: "Pli non distribué (NPAI, non réclamé…)." },
  rejete: { label: "Rejeté", badge: "badge-danger", aide: "Refusé par Maileva (adresse ou PDF invalide)." },
  erreur: { label: "Erreur", badge: "badge-danger", aide: "L'envoi n'est pas parti." },
};

/** Statuts pour lesquels il est utile de réinterroger Maileva. */
export function suiviActif(s: StatutEnvoiPostal): boolean {
  return s === "soumis" || s === "en_production" || s === "poste";
}

/** Traduit les statuts Maileva (envoi, destinataire, événements) en statut appli. */
export function statutDepuisMaileva(args: {
  statutEnvoi: string | null;
  statutDestinataire: string | null;
  evenements: { statut: string; detail: string | null }[];
  actuel: StatutEnvoiPostal;
}): StatutEnvoiPostal {
  const ev = args.evenements.map((e) => `${e.statut} ${e.detail || ""}`).join(" | ");
  if (/distribu|delivered|remis au destinataire|avis de r[ée]ception/i.test(ev)) return "distribue";
  if (/retour|non r[ée]clam|npai|undeliver|return/i.test(ev)) return "retour";
  const env = (args.statutEnvoi || "").toUpperCase();
  const dest = (args.statutDestinataire || "").toUpperCase();
  if (env === "REJECTED" || dest === "REJECTED") return "rejete";
  if (env === "PROCESSED_WITH_ERRORS") return "erreur";
  if (dest === "PROCESSED" || env === "PROCESSED") return args.actuel === "distribue" ? "distribue" : "poste";
  if (env === "ACCEPTED") return "en_production";
  if (env === "PENDING") return "soumis";
  if (env === "DRAFT") return "brouillon";
  return args.actuel;
}

const MAX = 38; // norme postale : 38 caractères par ligne

function propre(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * Transforme « nom + adresse libre » en 6 lignes normées (AFNOR NF Z 10-011) :
 *   1 identité · 2 complément d'identité · 3 complément d'adresse (bât., étage)
 *   4 n° + voie · 5 lieu-dit / BP · 6 CODE POSTAL + VILLE (majuscules).
 * La ligne 6 est obligatoire pour Maileva.
 */
export function lignesAdresse(nom: string, adresse: string): string[] {
  const lignes = ["", "", "", "", "", ""];
  const noms = (nom || "").split(/\n+/).map(propre).filter(Boolean);
  lignes[0] = noms[0] || "";
  lignes[1] = noms.slice(1).join(" ");

  const brut = (adresse || "").split(/\n+/).map(propre).filter(Boolean);
  // Adresse saisie sur UNE ligne : « 12 rue X 13001 Marseille » → on coupe au code postal.
  if (brut.length === 1) {
    const m = brut[0].match(/^(.*?)[,\s]+(\d{5})\s+(.+)$/);
    if (m) brut.splice(0, 1, m[1], `${m[2]} ${m[3]}`);
  }
  let iVille = brut.findIndex((l) => /^\d{5}\s+\S/.test(l));
  if (iVille < 0) iVille = brut.length - 1;
  const ville = brut[iVille] || "";
  const avant = brut.slice(0, Math.max(0, iVille));
  lignes[5] = ville.toUpperCase();
  // Dernière ligne avant la ville = voie ; ce qui précède = complément.
  if (avant.length) {
    const bp = avant.findIndex((l) => /^(bp|cs|tsa|cedex|lieu[- ]dit)\b/i.test(l));
    if (bp >= 0) lignes[4] = avant.splice(bp, 1)[0];
    lignes[3] = avant.pop() || "";
    lignes[2] = avant.join(" ");
  }
  return lignes.map((l) => l.slice(0, MAX));
}

/** Contrôles avant envoi : message d'erreur lisible, ou null si tout va bien. */
export function verifierAdresse(lignes: string[]): string | null {
  if (!lignes[0]?.trim()) return "Nom du destinataire manquant (ligne 1).";
  if (!lignes[3]?.trim() && !lignes[4]?.trim()) return "Numéro et voie manquants (ligne 4).";
  if (!/^\d{5}\s+\S/.test(lignes[5] || "")) return "Ligne 6 : code postal à 5 chiffres suivi de la ville (ex. 13001 MARSEILLE).";
  const long = lignes.findIndex((l) => (l || "").length > MAX);
  if (long >= 0) return `Ligne ${long + 1} trop longue (38 caractères maximum).`;
  return null;
}

export const LIBELLE_LIGNES = [
  "1 · Destinataire",
  "2 · Complément (à l'attention de…)",
  "3 · Bâtiment, étage, appartement",
  "4 · N° et voie",
  "5 · Lieu-dit, BP, CS",
  "6 · Code postal + VILLE",
];
