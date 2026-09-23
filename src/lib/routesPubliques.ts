/**
 * Pages accessibles SANS être connecté.
 *
 * Elles sortent du cadre habituel (ni barre latérale, ni écran de
 * connexion) :
 *   · /signer/<token>       signature à distance d'un document ;
 *   · /suivi/<token>        portail de suivi envoyé au client du garage ;
 *   · /etat                 état du service — c'est précisément la page
 *                           qu'on ouvre quand on n'arrive plus à se
 *                           connecter, elle ne doit donc rien exiger ;
 *   · /mentions-legales, /cgu, /confidentialite, /contact — vitrine
 *                           et obligations légales (v9.4).
 */
export function estRoutePublique(pathname?: string | null): boolean {
  if (!pathname) return false;
  return (
    pathname.startsWith("/signer/") ||
    pathname.startsWith("/suivi/") ||
    // Réponse du garage à l'expert (v13.25) : lien unique par demande.
    pathname.startsWith("/reponse-garage/") ||
    pathname === "/etat" ||
    pathname === "/mentions-legales" ||
    pathname === "/cgu" ||
    pathname === "/confidentialite" ||
    pathname === "/contact" ||
    pathname === "/facturation-electronique" ||
    // Déclaration de vente par les commerciaux (v10.0) : code apporteur, pas de compte.
    pathname === "/vente" ||
    // MODE EXPERT (v13.5) : l'espace caché /alliance → /expert gère LUI-MÊME sa
    // connexion (comptes autorisés, charte Alliance Experts) — hors AuthGate.
    pathname === "/alliance" ||
    pathname.startsWith("/expert")
  );
}
