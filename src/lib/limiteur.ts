// Limiteur de débit EN MÉMOIRE (par instance serveur) — suffisant pour freiner
// un robot sur les routes publiques ; pas une protection absolue (plusieurs
// instances Vercel = plusieurs compteurs). Nettoyage automatique pour que la
// table ne grossisse pas indéfiniment (v13.17, audit sécurité).

type Compteur = { n: number; depuis: number };
const tables = new Map<string, Map<string, Compteur>>();

export function tropDeDemandes(zone: string, cle: string, max: number, fenetreMs = 3_600_000): boolean {
  let t = tables.get(zone);
  if (!t) { t = new Map(); tables.set(zone, t); }
  const maintenant = Date.now();
  if (t.size > 5000) {
    t.forEach((c, k) => { if (maintenant - c.depuis > fenetreMs) t!.delete(k); });
    if (t.size > 5000) t.clear();
  }
  const c = t.get(cle);
  if (!c || maintenant - c.depuis > fenetreMs) { t.set(cle, { n: 1, depuis: maintenant }); return false; }
  c.n += 1;
  return c.n > max;
}

export function ipDe(req: Request): string {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "inconnue";
}
