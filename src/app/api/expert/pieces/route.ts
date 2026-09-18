import { NextRequest, NextResponse } from "next/server";
import { avecDelai, DelaiDepasse } from "@/lib/delai";
import { jsonDepuisTexte, nombre, preparerAppelIA, texte } from "@/lib/expertise/serveur";

/* ==================================================================
 *  RECHERCHE DE PIÈCES — estimation IA (mode expert, v13.5)
 *
 *  Entrée : véhicule (marque, modèle, finition, année, VIN) + désignation
 *  de la pièce. Sortie : désignation normalisée, référence OEM probable,
 *  fourchettes de prix HT (origine / neuf adaptable / occasion), temps de
 *  pose, remarques. C'est une AIDE au chiffrage : l'expert vérifie sur les
 *  catalogues (liens pré-remplis côté client) et retient un prix.
 * ================================================================== */

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 40_000;

const PROMPT = `Tu es un expert automobile français spécialisé dans le chiffrage de réparations carrosserie / mécanique.
On te donne un VÉHICULE et la DÉSIGNATION d'une pièce. Réponds UNIQUEMENT par cet objet JSON compact (aucun texte autour, pas de markdown) :

{"designation_normalisee":string,
"reference_oem":string|null,
"references_alternatives":string[],
"prix_origine":{"min":number,"max":number}|null,
"prix_neuf_adaptable":{"min":number,"max":number}|null,
"prix_occasion":{"min":number,"max":number}|null,
"prix_retenu":number|null,
"temps_pose_heures":number|null,
"peinture_necessaire":boolean,
"remarques":string|null}

Règles :
- Prix en euros HORS TAXES, marché français 2025-2026, pour CE véhicule précis (gamme, motorisation, année). Fourchettes réalistes.
- "prix_retenu" = prix d'origine constructeur médian (c'est la base d'un rapport d'expertise), arrondi à l'euro.
- "reference_oem" : la référence constructeur si tu la connais avec une bonne confiance, sinon null (n'invente pas).
- "references_alternatives" : jusqu'à 3 références équivalentiers connues (Valeo, Hella, TYC, Magneti Marelli…) ou vide.
- "temps_pose_heures" : temps barémé de remplacement (dépose/repose) en heures décimales.
- "peinture_necessaire" : true si la pièce est peinte dans la teinte du véhicule (aile, porte, pare-chocs, capot…).
- "remarques" : 1-2 phrases utiles (variantes selon finition, calibrage ADAS, pièce dispo en réemploi, etc.), ou null.`;

export async function POST(req: NextRequest) {
  const prep = await preparerAppelIA(req);
  if (!prep.ok) return prep.reponse;
  try {
    const body = (await req.json()) as { designation?: string; marque?: string; modele?: string; finition?: string; annee?: string; vin?: string; energie?: string };
    const designation = texte(body.designation, 200);
    if (!designation) return NextResponse.json({ error: "Indique la pièce recherchée." }, { status: 400 });
    const vehicule = [
      body.marque && `Marque : ${body.marque}`,
      body.modele && `Modèle : ${body.modele}`,
      body.finition && `Finition / motorisation : ${body.finition}`,
      body.annee && `Année (MEC) : ${body.annee}`,
      body.energie && `Énergie : ${body.energie}`,
      body.vin && `VIN : ${body.vin}`,
    ].filter(Boolean).join("\n") || "Véhicule non précisé";

    const message = await avecDelai(
      prep.client.messages.create({
        model: prep.model,
        max_tokens: 700,
        messages: [{ role: "user", content: `${PROMPT}\n\nVÉHICULE :\n${vehicule}\n\nPIÈCE : ${designation}` }],
      }),
      BUDGET_MS
    );
    await prep.enregistrer(message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);
    const part = message.content.find((c) => c.type === "text");
    const brut = jsonDepuisTexte(part && "text" in part ? part.text : "") as Record<string, unknown> | null;
    if (!brut) return NextResponse.json({ error: "Estimation indisponible, réessaie." }, { status: 422 });

    const fourchette = (v: unknown) => {
      const o = v as { min?: unknown; max?: unknown } | null;
      const min = nombre(o?.min); const max = nombre(o?.max);
      return min !== null && max !== null ? { min, max } : null;
    };
    return NextResponse.json({
      data: {
        designation,
        designation_normalisee: texte(brut.designation_normalisee),
        reference_oem: texte(brut.reference_oem, 60),
        references_alternatives: Array.isArray(brut.references_alternatives) ? brut.references_alternatives.map((r) => texte(r, 60)).filter(Boolean).slice(0, 3) : [],
        prix_origine: fourchette(brut.prix_origine),
        prix_neuf_adaptable: fourchette(brut.prix_neuf_adaptable),
        prix_occasion: fourchette(brut.prix_occasion),
        prix_retenu: nombre(brut.prix_retenu),
        temps_pose_heures: nombre(brut.temps_pose_heures),
        peinture_necessaire: Boolean(brut.peinture_necessaire),
        remarques: texte(brut.remarques, 500),
      },
    });
  } catch (e) {
    if (e instanceof DelaiDepasse) return NextResponse.json({ error: "L'estimation a pris trop de temps, réessaie." }, { status: 504 });
    const msg = e instanceof Error ? e.message : "Erreur inattendue.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
