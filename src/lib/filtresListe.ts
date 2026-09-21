// MÉMOIRE DES FILTRES D'UNE LISTE (v7.7)
//
// PROBLÈME : on filtre les sinistres (statut, cabinet, période, recherche…),
// on ouvre un dossier, on revient — et tout était remis à zéro : il fallait
// refaire la sélection à chaque dossier consulté.
//
// On mémorise donc la sélection dans le sessionStorage : elle survit à la
// navigation et au rafraîchissement de l'onglet, mais pas à la fermeture du
// navigateur (au prochain jour de travail, la liste repart propre).
//
// ⚠ Ne JAMAIS lire le sessionStorage pendant le rendu initial : le serveur
// n'y a pas accès, et React signalerait une différence d'hydratation. On
// restaure toujours dans un effet, après le montage.

/* v13.22 — la sélection n'est restaurée QUE quand on REVIENT d'un dossier
 * ouvert depuis la liste. Arriver sur la liste par le menu (autre onglet de
 * l'appli) ou après une reconnexion repart d'une liste propre : un filtre
 * oublié faisait « disparaître » des dossiers. */
const SUFFIXE_RETOUR = ".retour";

/** À appeler juste avant d'ouvrir un élément depuis la liste. */
export function marquerRetourAttendu(cle: string): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.setItem(cle + SUFFIXE_RETOUR, "1"); } catch { /* ignore */ }
}

/** Vrai une seule fois : au premier montage qui suit l'ouverture d'un élément. */
export function consommerRetourAttendu(cle: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    const v = window.sessionStorage.getItem(cle + SUFFIXE_RETOUR) === "1";
    window.sessionStorage.removeItem(cle + SUFFIXE_RETOUR);
    return v;
  } catch { return false; }
}

/** Le retour n'est plus attendu (on est parti ailleurs dans l'appli). */
export function annulerRetourAttendu(cle: string): void {
  if (typeof window === "undefined") return;
  try { window.sessionStorage.removeItem(cle + SUFFIXE_RETOUR); } catch { /* ignore */ }
}

/** Oublie toutes les sélections mémorisées (déconnexion, changement de compte). */
export function oublierEtatsListes(): void {
  if (typeof window === "undefined") return;
  try {
    const cles: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k && (k.endsWith(".selection") || k.endsWith(SUFFIXE_RETOUR))) cles.push(k);
    }
    cles.forEach((k) => window.sessionStorage.removeItem(k));
  } catch { /* ignore */ }
}

export function lireEtatListe<T extends object>(cle: string, defaut: T): T {
  if (typeof window === "undefined") return defaut;
  try {
    const brut = window.sessionStorage.getItem(cle);
    if (!brut) return defaut;
    const enregistre = JSON.parse(brut) as Partial<T>;
    // Fusion avec les valeurs par défaut : un filtre ajouté plus tard ne fait
    // pas planter la lecture d'un état enregistré par une version antérieure.
    return { ...defaut, ...enregistre };
  } catch {
    return defaut;
  }
}

export function ecrireEtatListe<T extends object>(cle: string, valeur: T): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(cle, JSON.stringify(valeur));
  } catch {
    /* mode navigation privée / quota plein : on continue sans mémoire */
  }
}
