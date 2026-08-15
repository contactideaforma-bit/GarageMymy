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
