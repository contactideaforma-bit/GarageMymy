export function formatEuros(value: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value || 0);
}

// Date locale au format YYYY-MM-DD (fuseau du navigateur — Paris).
// À utiliser à la place de `toISOString().slice(0,10)` qui, entre minuit et
// 2 h du matin, renvoie la date de la VEILLE (décalage UTC).
export function ymd(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const j = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${j}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("fr-FR");
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ---------- Pipeline de statut du dossier ----------
// v6.7 : plus de statut « Clôturé » — un dossier PAYÉ est clôturé.
// L'étape 5 « facture » se lit désormais « Facture envoyée » (le code
// technique reste `facture` : aucune donnée à migrer).
export const STATUTS_ORDRE = [
  "nouveau",
  "expertise",
  "devis",
  "reparation",
  "facture",
  "rendu",
  "paye",
] as const;

export type StatutKey = (typeof STATUTS_ORDRE)[number];

export const STATUTS_INFO: Record<
  string,
  { label: string; badge: string; dot: string }
> = {
  nouveau: { label: "Nouveau", badge: "bg-slate-100 text-slate-700", dot: "bg-slate-400" },
  expertise: { label: "Expertise faite", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
  devis: { label: "Devis / OR", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  reparation: { label: "Réparation", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  facture: { label: "Facture envoyée", badge: "bg-cyan-100 text-cyan-700", dot: "bg-cyan-500" },
  rendu: { label: "Véhicule rendu", badge: "bg-orange-100 text-orange-700", dot: "bg-orange-500" },
  paye: { label: "Payé", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  // Statut hérité (avant v6.7) : les dossiers 'cloture' sont basculés en
  // 'paye' par la migration v36 ; on garde le libellé au cas où.
  cloture: { label: "Payé", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  // valeurs héritées de la v0
  en_cours: { label: "En cours", badge: "bg-blue-100 text-blue-700", dot: "bg-blue-500" },
  en_attente: { label: "En attente", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  termine: { label: "Terminé", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
};

export function labelStatut(statut: string): string {
  return STATUTS_INFO[statut]?.label || statut;
}

// Rang d'un statut dans le pipeline (pour trier les dossiers par avancement).
// Les statuts inconnus/hérités sont renvoyés en fin de liste.
export function indexStatut(statut: string): number {
  const i = (STATUTS_ORDRE as readonly string[]).indexOf(statut);
  return i === -1 ? STATUTS_ORDRE.length : i;
}

// Libellés de statut spécifiques au métier vitrage (mêmes codes, autres mots).
const STATUTS_LABEL_VITRAGE: Record<string, string> = {
  expertise: "Diagnostic",
  reparation: "Intervention",
  rendu: "Véhicule restitué",
};

// Libellé de statut adapté au métier (carrosserie par défaut).
export function libelleStatut(statut: string, metier?: string | null): string {
  if (metier === "vitrage" && STATUTS_LABEL_VITRAGE[statut]) {
    return STATUTS_LABEL_VITRAGE[statut];
  }
  return labelStatut(statut);
}

export function badgeStatut(statut: string): string {
  return STATUTS_INFO[statut]?.badge || "bg-slate-100 text-slate-700";
}

// Un dossier est "actif" tant qu'il n'est pas PAYÉ (v6.7 : payé = clôturé).
// 'cloture' est conservé pour les données antérieures à la migration v36.
export function estActif(statut: string): boolean {
  return statut !== "paye" && statut !== "cloture";
}

// Fin de parcours : plus rien à faire sur le dossier (hors archivage).
export function estTermine(statut: string): boolean {
  return statut === "paye" || statut === "cloture";
}

// ---------- Progression du dossier (barre rétro) ----------
// 100 % = dossier complet ET payé.
const PROGRESSION: Record<string, number> = {
  nouveau: 5,
  expertise: 20,
  devis: 35,
  reparation: 55,
  facture: 70,
  rendu: 85,
  paye: 100,
  cloture: 100,
  // valeurs héritées de la v0
  en_attente: 35,
  en_cours: 55,
  termine: 100,
};

export function progressionDossier(statut: string): number {
  return PROGRESSION[statut] ?? 5;
}

// Ajoute n jours OUVRÉS (lun-ven) à une date.
export function addJoursOuvres(depart: Date | string, n: number): Date {
  const d = new Date(depart);
  let restants = n;
  while (restants > 0) {
    d.setDate(d.getDate() + 1);
    const jour = d.getDay();
    if (jour !== 0 && jour !== 6) restants--;
  }
  return d;
}

// Message d'erreur lisible, y compris pour les erreurs Supabase
// (objets simples, PAS des instances de Error → sinon message générique inutile).
export function messageErreur(err: unknown, fallback = "Erreur lors de l'enregistrement."): string {
  const brut =
    err instanceof Error
      ? err.message
      : err && typeof err === "object" && "message" in err
        ? String((err as { message?: unknown }).message || "")
        : "";
  if (!brut) return fallback;
  if (/does not exist|schema cache/i.test(brut)) {
    return `Table manquante côté Supabase — exécute la dernière migration SQL (dossier supabase/) dans SQL Editor. Détail : ${brut}`;
  }
  if (/row-level security|violates.*policy/i.test(brut)) {
    return `Accès refusé par la sécurité (RLS) — vérifie que la migration des policies a bien été exécutée. Détail : ${brut}`;
  }
  return brut;
}

/**
 * v13.47 — Mise en forme d'une immatriculation PENDANT la frappe :
 * « aa345bb » → « AA-345-BB », « 1234ab56 » (ancien format) → « 1234 AB 56 ».
 * Tolérante : tant que la saisie est incomplète on n'ajoute un tiret qu'au
 * moment où le bloc suivant commence (« AA » reste « AA », « AA3 » → « AA-3 »).
 * Une plaque qui ne colle à aucun format (étrangère, WW…) est renvoyée en
 * majuscules telle quelle, sans rien casser.
 */
export function formaterSaisieImmat(brut: string): string {
  const s = (brut || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!s) return "";
  // SIV (depuis 2009) : AA-123-BB
  let m = s.match(/^([A-Z]{1,2})(\d{0,3})([A-Z]{0,2})(.*)$/);
  if (m && /^[A-Z]/.test(s)) {
    const [, l1, ch, l2, reste] = m;
    if (reste) return s; // trop long / format inconnu : on laisse brut
    if (!ch) return l2 ? s : l1; // « AA » ou « AAA » (lettres seules) : tel quel
    if (l1.length < 2) return s;
    return `${l1}-${ch}${l2 ? "-" + l2 : ""}`;
  }
  // FNI (avant 2009) : 1234 AB 56
  m = s.match(/^(\d{1,4})([A-Z]{0,3})(\d{0,3})(.*)$/);
  if (m && /^\d/.test(s)) {
    const [, n1, le, n2, reste] = m;
    if (reste) return s;
    return n1 + (le ? " " + le : "") + (n2 ? " " + n2 : "");
  }
  return s;
}

/** Clé de comparaison d'une immatriculation (sans tirets/espaces, majuscules). */
export function cleImmatriculation(s: string | null | undefined): string {
  return (s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
