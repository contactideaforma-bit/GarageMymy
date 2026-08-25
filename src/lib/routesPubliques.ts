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
    pathname === "/etat" ||
    pathname === "/mentions-legales" ||
    pathname === "/cgu" ||
    pathname === "/confidentialite" ||
    pathname === "/contact"
  );
}
