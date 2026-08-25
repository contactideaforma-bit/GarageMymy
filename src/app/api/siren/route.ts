import { NextResponse } from "next/server";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";

// ============================================================
//  RECHERCHE DE SIREN (v52) — proxy vers l'API publique de l'État
//  « Recherche d'entreprises » (recherche-entreprises.api.gouv.fr) :
//  gratuite, sans clé, données INSEE/RNE à jour.
//
//  Passe par le serveur parce que la CSP de l'appli n'autorise pas le
//  navigateur à appeler d'autres domaines, et pour lisser les appels.
//  GET /api/siren?q=AXA France IARD   → { resultats: [...] }
//  GET /api/siren?siren=722057460     → fiche exacte (validation)
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 15;

export type ResultatSiren = {
  siren: string;
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  tva: string;
  activite: string;
  actif: boolean;
};

type Brut = {
  siren?: string;
  nom_complet?: string;
  nom_raison_sociale?: string;
  etat_administratif?: string;
  activite_principale?: string;
  tva?: string[];
  siege?: { adresse?: string; code_postal?: string; libelle_commune?: string };
};

function normalise(r: Brut): ResultatSiren {
  const adresseComplete = r.siege?.adresse || "";
  const cp = r.siege?.code_postal || "";
  const ville = r.siege?.libelle_commune || "";
  // L'API renvoie « 313 TERRASSE DE L'ARCHE 92000 NANTERRE » : on isole la voie.
  const voie = cp && adresseComplete.includes(cp) ? adresseComplete.slice(0, adresseComplete.indexOf(cp)).trim() : adresseComplete;
  return {
    siren: r.siren || "",
    nom: r.nom_raison_sociale || r.nom_complet || "",
    adresse: voie,
    codePostal: cp,
    ville,
    tva: (r.tva || [])[0] || "",
    activite: r.activite_principale || "",
    actif: r.etat_administratif === "A",
  };
}

export async function GET(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") || "").trim().slice(0, 120);
  const siren = (url.searchParams.get("siren") || "").replace(/\D/g, "");
  if (!q && siren.length !== 9) {
    return NextResponse.json({ error: "Indiquez un nom (q) ou un SIREN à 9 chiffres." }, { status: 400 });
  }

  const cible = new URL("https://recherche-entreprises.api.gouv.fr/search");
  cible.searchParams.set("q", siren.length === 9 ? siren : q);
  cible.searchParams.set("per_page", "8");
  cible.searchParams.set("page", "1");

  try {
    const res = await fetch(cible.toString(), {
      headers: { Accept: "application/json", "User-Agent": "MyEasyAuto/1.0 (contact@myeasyauto.fr)" },
      signal: AbortSignal.timeout(10_000),
      cache: "no-store",
    });
    if (!res.ok) {
      return NextResponse.json({ error: `Annuaire des entreprises indisponible (HTTP ${res.status}).` }, { status: 502 });
    }
    const data = (await res.json()) as { results?: Brut[]; total_results?: number };
    const resultats = (data.results || []).map(normalise).filter((r) => r.siren);
    return NextResponse.json({ resultats, total: data.total_results || resultats.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error && err.name === "TimeoutError" ? "L'annuaire des entreprises ne répond pas." : "Recherche impossible." },
      { status: 502 }
    );
  }
}
