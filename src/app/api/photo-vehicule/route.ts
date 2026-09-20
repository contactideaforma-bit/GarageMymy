import { NextRequest, NextResponse } from "next/server";

/**
 * PHOTO D'ILLUSTRATION DU VÉHICULE (v13.10)
 *
 * À partir du libellé « Marque et modèle » du dossier (ex. « RENAULT CAPTUR
 * 1.5 DCI 90 BUSINESS »), renvoie la vignette Wikipédia du modèle. C'est une
 * photo GÉNÉRIQUE du modèle (pas la couleur ni l'année exacte) : un plus
 * visuel, jamais une donnée du dossier. Gratuit, sans clé d'API.
 *
 * Réponse : { url, titre, page } ou { url: null }. Mise en cache 30 jours
 * (fetch Next) + cache mémoire par processus.
 */

export const runtime = "nodejs";

const MARQUES_DEUX_MOTS = ["alfa romeo", "land rover", "aston martin", "mercedes benz", "rolls royce", "range rover", "ds automobiles"];
const ALIAS_MARQUE: Record<string, string> = { vw: "Volkswagen", "mercedes benz": "Mercedes-Benz", mercedes: "Mercedes-Benz" };
// Mots qui n'identifient pas le modèle à eux seuls : on prend aussi le suivant
// (« Classe A », « Série 1 », « Model 3 », « Grand Scénic »).
const GENERIQUES = /^(classe|class|s[ée]rie|series|model|mod[èe]le|type|grand|nouvelle?|new)$/i;

/** « RENAULT CAPTUR 1.5 DCI 90 BUSINESS » → « Renault Captur », « BMW SERIE 1 118D » → « BMW Série 1 ». */
function libelleModele(brut: string): string | null {
  const mots = brut.replace(new RegExp("[^\\p{L}\\p{N} .\\-]", "gu"), " ").trim().split(/\s+/).filter(Boolean);
  if (mots.length === 0) return null;
  const deuxMots = mots.length >= 2 && MARQUES_DEUX_MOTS.includes(`${mots[0]} ${mots[1]}`.toLowerCase());
  const marqueBrute = (deuxMots ? mots.slice(0, 2) : mots.slice(0, 1)).join(" ");
  const marque = ALIAS_MARQUE[marqueBrute.toLowerCase()] || marqueBrute;
  const reste = mots.slice(deuxMots ? 2 : 1);
  if (reste.length === 0) return null; // marque seule : trop vague
  const modele = GENERIQUES.test(reste[0]) && reste[1] ? `${reste[0]} ${reste[1]}` : reste[0];
  return `${marque} ${modele}`;
}

type Resultat = { url: string | null; titre?: string; page?: string };
const cache = new Map<string, Resultat>();

async function chercherWikipedia(lang: "fr" | "en", q: string, marque: string): Promise<Resultat | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: q,
    gsrlimit: "4",
    gsrnamespace: "0",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: "560",
    format: "json",
  });
  const res = await fetch(`https://${lang}.wikipedia.org/w/api.php?${params}`, {
    headers: { "User-Agent": "MyEasyAuto/1.0 (illustration vehicule)" },
    next: { revalidate: 60 * 60 * 24 * 30 },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { query?: { pages?: Record<string, { title: string; index?: number; thumbnail?: { source: string } }> } };
  const pages = Object.values(json.query?.pages ?? {}).sort((a, b) => (a.index ?? 99) - (b.index ?? 99));
  const m = marque.toLowerCase();
  const page = pages.find((p) => p.thumbnail?.source && p.title.toLowerCase().includes(m));
  if (!page?.thumbnail) return null;
  return { url: page.thumbnail.source, titre: page.title, page: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(page.title.replace(/ /g, "_"))}` };
}

export async function GET(req: NextRequest) {
  const brut = (req.nextUrl.searchParams.get("q") || "").slice(0, 120);
  const q = libelleModele(brut);
  if (!q) return NextResponse.json({ url: null });
  const cle = q.toLowerCase();
  const memo = cache.get(cle);
  if (memo) return NextResponse.json(memo);

  // Mot-clé de contrôle : le titre Wikipédia doit contenir la marque (1er mot).
  const marque = q.split(/[\s-]/)[0];
  let resultat: Resultat = { url: null };
  try {
    resultat = (await chercherWikipedia("fr", q, marque)) ?? (await chercherWikipedia("en", q, marque)) ?? { url: null };
  } catch {
    /* réseau indisponible : pas de photo, l'appli n'en dépend pas */
  }
  cache.set(cle, resultat);
  return NextResponse.json(resultat, { headers: { "Cache-Control": "public, max-age=86400" } });
}
