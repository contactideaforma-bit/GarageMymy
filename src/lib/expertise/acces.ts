/* ====================================================================
 *  MODE EXPERT (v13.5) — accès caché « Alliance Experts »
 *
 *  L'espace n'apparaît nulle part dans My Easy Auto : on y entre par le
 *  lien secret myeasyauto.fr/alliance, avec un compte AUTORISÉ ci-dessous.
 *  Tout autre compte connecté est refusé (message + déconnexion).
 *
 *  Le contrôle est fait côté client (affichage) ET côté serveur (routes
 *  /api/expert/*, qui relisent l'email depuis le jeton Supabase).
 * ==================================================================== */

export const COMPTES_EXPERT = ["alliance@mail.fr", "contact.ideaforma@gmail.com"];

export function aAccesExpert(email?: string | null): boolean {
  if (!email) return false;
  return COMPTES_EXPERT.includes(email.trim().toLowerCase());
}

/** Le lien secret (à ne pas afficher dans l'appli). */
export const LIEN_ALLIANCE = "/alliance";
export const ACCUEIL_EXPERT = "/expert";

export function estRouteExpert(pathname?: string | null): boolean {
  if (!pathname) return false;
  return pathname === LIEN_ALLIANCE || pathname.startsWith("/expert");
}
