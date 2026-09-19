// ====================================================================
//  ONGLETS DE DOSSIERS (v12.5)
//
//  Demande : « ouvrir plusieurs onglets dans la partie sinistre pour avoir
//  plusieurs dossiers simultanément ». Chaque fiche ouverte reste épinglée
//  dans une barre d'onglets au-dessus des pages /sinistres, mémorisée PAR
//  APPAREIL (localStorage) : on passe d'un dossier à l'autre en un clic,
//  comme dans un navigateur, sans repasser par la liste.
//
//  v13.10 — onglets PAR COMPTE : la liste est rangée sous une clé propre à
//  l'utilisateur connecté (`mea.sinistres.onglets.<uid>`). Avant, un garage
//  qui se connectait sur un appareil partagé retrouvait les onglets du
//  garage précédent et atterrissait sur « Dossier introuvable ». Tant
//  qu'aucun compte n'est connu (déconnecté), la barre est vide et rien
//  n'est écrit.
// ====================================================================

export type OngletDossier = { id: string; label: string };

const CLE_BASE = "mea.sinistres.onglets";
const EVENEMENT = "mea:onglets";
const MAX_ONGLETS = 8;

let compteCourant: string | null = null;
const cle = () => (compteCourant ? `${CLE_BASE}.${compteCourant}` : null);

/**
 * Déclare le compte connecté (appelé par AuthGate à chaque changement de
 * session). `null` à la déconnexion : la barre se vide aussitôt.
 */
export function definirCompteOnglets(uid: string | null) {
  if (typeof window === "undefined") return;
  if (compteCourant === uid) return;
  compteCourant = uid;
  try {
    // Ancienne clé globale (avant v13.10) : on la purge, elle mélangeait
    // les dossiers de tous les comptes passés sur l'appareil.
    window.localStorage.removeItem(CLE_BASE);
  } catch {
    /* ignore */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

export function lireOnglets(): OngletDossier[] {
  if (typeof window === "undefined") return [];
  const k = cle();
  if (!k) return [];
  try {
    const brut = window.localStorage.getItem(k);
    const liste = brut ? (JSON.parse(brut) as unknown) : [];
    if (!Array.isArray(liste)) return [];
    return liste
      .filter((o): o is OngletDossier => Boolean(o) && typeof o === "object" && typeof (o as OngletDossier).id === "string")
      .map((o) => ({ id: o.id, label: String(o.label || "Dossier") }));
  } catch {
    return [];
  }
}

function ecrire(liste: OngletDossier[]) {
  const k = cle();
  if (!k) return; // déconnecté : rien à mémoriser
  try {
    window.localStorage.setItem(k, JSON.stringify(liste.slice(-MAX_ONGLETS)));
  } catch {
    /* stockage indisponible : la barre vit seulement en mémoire */
  }
  window.dispatchEvent(new Event(EVENEMENT));
}

/** Épingle (ou met à jour le libellé de) la fiche ouverte. */
export function ouvrirOnglet(id: string, label: string) {
  if (typeof window === "undefined") return;
  const liste = lireOnglets();
  const existant = liste.find((o) => o.id === id);
  if (existant) {
    if (existant.label !== label) ecrire(liste.map((o) => (o.id === id ? { ...o, label } : o)));
    return;
  }
  ecrire([...liste, { id, label }]);
}

export function fermerOnglet(id: string) {
  if (typeof window === "undefined") return;
  ecrire(lireOnglets().filter((o) => o.id !== id));
}

export function fermerTousLesOnglets() {
  if (typeof window === "undefined") return;
  ecrire([]);
}

/** S'abonne aux changements (autre composant OU autre onglet du navigateur). */
export function surChangementOnglets(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const surStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === cle()) cb();
  };
  window.addEventListener(EVENEMENT, cb);
  window.addEventListener("storage", surStorage);
  return () => {
    window.removeEventListener(EVENEMENT, cb);
    window.removeEventListener("storage", surStorage);
  };
}

/** Libellé court d'un dossier pour l'onglet : immat, sinon n° sinistre, sinon client. */
export function libelleOnglet(d: {
  immatriculation?: string | null;
  numero_sinistre?: string | null;
  client_nom?: string | null;
}): string {
  const principal = d.immatriculation || d.numero_sinistre || d.client_nom || "Dossier";
  const client = d.immatriculation && d.client_nom ? ` · ${d.client_nom.split(" ")[0]}` : "";
  return `${principal}${client}`;
}
