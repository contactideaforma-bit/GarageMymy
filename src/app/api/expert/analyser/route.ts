import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { avecDelai, DelaiDepasse } from "@/lib/delai";
import { texteDuPdf } from "@/lib/pdfTexte";
import { jsonDepuisTexte, nombre, preparerAppelIA, texte } from "@/lib/expertise/serveur";

/* ==================================================================
 *  ANALYSE POUR LE RAPPORT D'EXPERTISE (mode expert, v13.5)
 *
 *  Trois sources → UNE structure de chiffrage (chocs + opérations) :
 *   · mode=devis    : devis du garage (PDF/photo) → postes MO, pièces, prix
 *   · mode=facture  : facture du garage → idem (montants réellement facturés)
 *   · mode=rapport  : PRÉ-RAPPORT de l'expert (PDF sorti de son logiciel :
 *                     AlphaExpert, Darva, modèle Alliance…) → même structure,
 *                     pour le contrôle du devis (v13.23)
 *   · mode=photos   : photos du véhicule (jusqu'à 10) + contexte véhicule →
 *                     dommages constatés, opérations proposées, heures et
 *                     prix ESTIMÉS. C'est une ÉBAUCHE : l'expert relit tout.
 *
 *  Sortie : { data: { vehicule, reparateur, document, chocs, operations,
 *  zones_endommagees, dommages, remarques, confiance } }.
 * ================================================================== */

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 50_000;
const TEXTE_MAX = 14000;

const SCHEMA = `{"vehicule":{"immatriculation":string|null,"marque":string|null,"modele":string|null,"vin":string|null,"kilometrage":number|null}|null,
"reparateur":{"nom":string|null,"adresse":string|null,"siret":string|null}|null,
"document":{"numero":string|null,"date":string|null,"total_ht":number|null,"total_tva":number|null,"total_ttc":number|null}|null,
"chocs":[{"numero":number,"libelle":string,"postes":[{"poste":string,"heures":number,"taux":number,"remise":number,"forfait":number|null}]}],
"operations":[{"op":"E"|"FO"|"I"|"L"|"M"|"N"|"P"|"V"|"A"|"C","peinture":boolean,"designation":string,"qte":number,"prix_unit":number,"remise":number,"reference":string|null,"qualite":"origine"|"equivalente"|"reemploi"|null}],
"zones_endommagees":[{"zone":string,"gravite":"legere"|"moyenne"|"forte","description":string}],
"dommages":string|null,
"remarques":string|null,
"confiance":"faible"|"moyenne"|"bonne"}`;

const REGLES_COMMUNES = `CONVENTIONS DU RAPPORT D'EXPERTISE (modèle Alliance Experts) :
- "chocs" : un choc par zone d'impact (en général 1). Ses "postes" sont les lignes de main-d'œuvre : "Tôlerie T1", "Tôlerie T2", "Tôlerie T3", "Mécanique M1", "Peinture T1", "Peinture T2", "Nacré vernis" (vernis / bi-couches), "Opaque vernis", "Ingrédients peinture" (→ mettre le montant dans "forfait" et heures 0), "Forfait" (→ "forfait"). heures en décimal, taux en €/h HT, remise en %.
- "operations" : la liste "Opérations effectuées". Codes : E = remplacement (pièce, avec "prix_unit" HT unitaire et "qte"), I = redressage, L = peinture seule, N = dépose/repose, FO = forfait (montant dans prix_unit), M = marbre, P = contrôle, V = mesure, A = port, C = consigne. "peinture" = true quand l'opération inclut une peinture (le * du rapport). Les opérations de main-d'œuvre (I, L, N, P, V) ont qte 0 et prix_unit 0 : leur temps est déjà dans les postes du choc.
- Désignations en MAJUSCULES, abrégées comme dans un chiffrage (AILE AVG., PORTE ARG., BOUCLIER AV., OPTIQUE AVD., CAPOT MOTEUR REPARER…). AVG/AVD/ARG/ARD = avant gauche / avant droit / arrière gauche / arrière droit.
- REMISES : "remise" en % (0 si aucune). Sur un poste de main-d'œuvre, la remise de la ligne ou du tableau MO. Sur une pièce, la remise indiquée sur la ligne ou la remise globale "pièces" du document (ex. « remise pièces 10 % » → remise 10 sur chaque pièce E). "prix_unit" reste le prix unitaire AVANT remise.
- Montants en euros HT, nombres avec point décimal, sans symbole. N'invente pas de références : null si absentes.
Renvoie UNIQUEMENT cet objet JSON (aucun texte autour, pas de markdown) :
${SCHEMA}`;

const PROMPT_DOCUMENT = (mode: string) => `Tu es expert automobile. Tu lis ${mode === "facture" ? "la FACTURE" : "le DEVIS"} d'un garage / carrossier pour en tirer le chiffrage d'un procès-verbal d'expertise.
Reporte FIDÈLEMENT ce que le document contient : heures et taux de main-d'œuvre par catégorie (tôlerie, peinture, mécanique), ingrédients peinture, pièces (désignation, quantité, prix unitaire HT), forfaits. Si le document donne un total MO sans détail d'heures, crée un poste "Tôlerie T1" avec heures = montant / taux (taux 60 si inconnu). Lis aussi le véhicule, le garage émetteur et les totaux du document.
"zones_endommagees" peut rester vide. "dommages" = résumé en une phrase des dégâts réparés.
${REGLES_COMMUNES}`;

const PROMPT_PRE_RAPPORT = `Tu es expert automobile. Tu lis un PRÉ-RAPPORT / RAPPORT D'EXPERTISE (chiffrage établi par un expert, souvent édité par un logiciel d'expertise : AlphaExpert, Darva, Sidexa, modèle Alliance Experts…) pour en tirer le chiffrage retenu par l'expert.
Reporte FIDÈLEMENT le chiffrage de l'expert : tableau « Détail choc » (heures et taux par poste : tôlerie T1/T2/T3, peinture, vernis, ingrédients, forfaits) et tableau « Opérations effectuées » (code opération E / I / L / N / P…, * de peinture, désignation, quantité, prix unitaire HT, remise). Les lettres O / Q / R après une pièce = qualité origine / équivalente / réemploi.
Ignore les montants de vétusté, franchise, SRGC et la TVA : seul le chiffrage des réparations compte. "document.total_ht" = total HT des réparations AVANT vétusté/remise s'il est imprimé, sinon le total HT.
"reparateur" = le réparateur désigné dans le rapport. "zones_endommagees" peut rester vide.
${REGLES_COMMUNES}`;

const PROMPT_PHOTOS = (ctx: string, taux: { t1: number; t2: number; peinture: number }) => `Tu es expert automobile en carrosserie. Tu examines des PHOTOS d'un véhicule sinistré pour préparer une ÉBAUCHE de chiffrage (avant travaux).
VÉHICULE :
${ctx}
TAUX HORAIRES DU RÉPARATEUR : Tôlerie T1 ${taux.t1} €/h, Tôlerie T2 ${taux.t2} €/h, Peinture ${taux.peinture} €/h.

Méthode :
1. Identifie chaque zone endommagée (aile, porte, bouclier, capot, optique, jante, vitrage…), le côté (AVG/AVD/ARG/ARD) et la gravité visible.
2. Décide pour chaque élément : remplacement (E) si déformé/fendu/percé ou élément de sécurité (optique, airbag, ceinture), redressage (I) si bosse réparable, peinture seule (L) pour les rayures et les éléments adjacents à raccorder.
3. Estime les heures : tôlerie (dépose/repose, redressage) en "Tôlerie T1"/"Tôlerie T2", préparation + peinture en "Peinture T1", vernis en "Nacré vernis" (~ même volume que Peinture T1 pour un bi-couche). Reste réaliste (barèmes constructeurs).
4. Estime le prix unitaire HT des pièces à remplacer (pièce d'origine, marché français) et mets "qualite":"origine".
5. "dommages" : description synthétique (2-3 phrases). "remarques" : ce qui doit être VÉRIFIÉ sur place (chocs cachés, ADAS, structure, contrôle géométrie). "confiance" selon la qualité des photos.
Ne mentionne QUE ce qui est visible ou logiquement lié (raccords de peinture). Aucun dommage inventé.
${REGLES_COMMUNES}`;

const OPS = new Set(["E", "FO", "I", "L", "M", "N", "P", "V", "A", "C"]);

function normaliser(brut: Record<string, unknown>) {
  const veh = brut.vehicule as Record<string, unknown> | null;
  const rep = brut.reparateur as Record<string, unknown> | null;
  const doc = brut.document as Record<string, unknown> | null;
  const chocs = (Array.isArray(brut.chocs) ? brut.chocs : []).map((c, i) => {
    const cc = c as Record<string, unknown>;
    return {
      numero: Number(cc.numero) || i + 1,
      libelle: texte(cc.libelle, 80) || `Choc ${i + 1}`,
      postes: (Array.isArray(cc.postes) ? cc.postes : []).map((p) => {
        const pp = p as Record<string, unknown>;
        return {
          poste: texte(pp.poste, 40) || "Tôlerie T1",
          heures: nombre(pp.heures) ?? 0,
          taux: nombre(pp.taux) ?? 0,
          remise: nombre(pp.remise) ?? 0,
          forfait: nombre(pp.forfait),
        };
      }).filter((p) => p.heures > 0 || (p.forfait ?? 0) > 0),
    };
  }).filter((c) => c.postes.length > 0);
  const operations = (Array.isArray(brut.operations) ? brut.operations : []).map((o) => {
    const oo = o as Record<string, unknown>;
    const op = String(oo.op || "E").toUpperCase();
    const q = texte(oo.qualite, 20);
    return {
      op: OPS.has(op) ? op : "E",
      peinture: Boolean(oo.peinture),
      designation: (texte(oo.designation, 120) || "").toUpperCase(),
      qte: nombre(oo.qte) ?? 0,
      prix_unit: nombre(oo.prix_unit) ?? 0,
      remise: Math.min(100, Math.max(0, nombre(oo.remise) ?? 0)),
      reference: texte(oo.reference, 60),
      qualite: q === "origine" || q === "equivalente" || q === "reemploi" ? q : null,
    };
  }).filter((o) => o.designation);
  const zones = (Array.isArray(brut.zones_endommagees) ? brut.zones_endommagees : []).map((z) => {
    const zz = z as Record<string, unknown>;
    const g = texte(zz.gravite, 10);
    return { zone: texte(zz.zone, 60) || "", gravite: g === "forte" || g === "moyenne" ? g : "legere", description: texte(zz.description, 300) || "" };
  }).filter((z) => z.zone);
  const conf = texte(brut.confiance, 10);
  return {
    vehicule: veh ? { immatriculation: texte(veh.immatriculation, 12), marque: texte(veh.marque, 40), modele: texte(veh.modele, 60), vin: texte(veh.vin, 20), kilometrage: nombre(veh.kilometrage) } : null,
    reparateur: rep ? { nom: texte(rep.nom, 80), adresse: texte(rep.adresse, 200), siret: texte(rep.siret, 20) } : null,
    document: doc ? { numero: texte(doc.numero, 40), date: texte(doc.date, 12), total_ht: nombre(doc.total_ht), total_tva: nombre(doc.total_tva), total_ttc: nombre(doc.total_ttc) } : null,
    chocs,
    operations,
    zones_endommagees: zones,
    dommages: texte(brut.dommages, 800),
    remarques: texte(brut.remarques, 800),
    confiance: conf === "bonne" || conf === "moyenne" ? conf : "faible",
  };
}

export async function POST(req: NextRequest) {
  const prep = await preparerAppelIA(req);
  if (!prep.ok) return prep.reponse;
  try {
    const form = await req.formData();
    const mode = String(form.get("mode") || "devis");
    const contexte = String(form.get("contexte") || "");
    const taux = {
      t1: Number(form.get("taux_t1")) || 65,
      t2: Number(form.get("taux_t2")) || 70,
      peinture: Number(form.get("taux_peinture")) || 70,
    };
    const blocs: unknown[] = [];

    if (mode === "photos") {
      const fichiers = form.getAll("photos").filter((f): f is File => f instanceof File).slice(0, 10);
      if (!fichiers.length) return NextResponse.json({ error: "Aucune photo reçue." }, { status: 400 });
      let total = 0;
      for (const f of fichiers) {
        total += f.size;
        if (total > 18 * 1024 * 1024) return NextResponse.json({ error: "Photos trop lourdes (max 18 Mo au total)." }, { status: 413 });
        const b64 = Buffer.from(await f.arrayBuffer()).toString("base64");
        blocs.push({ type: "text", text: `PHOTO : ${f.name}` });
        blocs.push({ type: "image", source: { type: "base64", media_type: f.type || "image/jpeg", data: b64 } });
      }
      blocs.push({ type: "text", text: PROMPT_PHOTOS(contexte || "non précisé", taux) });
    } else {
      const file = form.get("file");
      if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
      if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 413 });
      const bytes = Buffer.from(await file.arrayBuffer());
      const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
      let calque = "";
      if (isPdf) {
        try { calque = texteDuPdf(bytes).trim(); } catch { calque = ""; }
      }
      if (calque.length > 200) {
        const extrait = calque.length <= TEXTE_MAX ? calque : calque.slice(0, TEXTE_MAX * 0.7) + "\n[…]\n" + calque.slice(-TEXTE_MAX * 0.3);
        blocs.push({ type: "text", text: `NOM DU FICHIER : ${file.name}\n\n-----DÉBUT DU TEXTE DU DOCUMENT-----\n${extrait}\n-----FIN DU TEXTE DU DOCUMENT-----` });
      } else {
        const b64 = bytes.toString("base64");
        blocs.push(isPdf
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
          : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } });
        blocs.push({ type: "text", text: `NOM DU FICHIER : ${file.name}` });
      }
      if (contexte) blocs.push({ type: "text", text: `CONTEXTE DU DOSSIER :\n${contexte}` });
      blocs.push({ type: "text", text: mode === "rapport" ? PROMPT_PRE_RAPPORT : PROMPT_DOCUMENT(mode) });
    }

    const message = await avecDelai(
      prep.client.messages.create({
        model: prep.model,
        max_tokens: 4000,
        messages: [{ role: "user", content: blocs as unknown as Anthropic.MessageParam["content"] }],
      }),
      BUDGET_MS
    );
    await prep.enregistrer(message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);
    const part = message.content.find((c) => c.type === "text");
    const brut = jsonDepuisTexte(part && "text" in part ? part.text : "") as Record<string, unknown> | null;
    if (!brut) return NextResponse.json({ error: "Analyse illisible : réessaie avec un document plus net." }, { status: 422 });
    return NextResponse.json({ data: normaliser(brut) });
  } catch (e) {
    if (e instanceof DelaiDepasse) {
      return NextResponse.json({ error: "L'analyse a dépassé le temps autorisé : envoie moins de pages / photos et réessaie." }, { status: 504 });
    }
    const msg = e instanceof Error ? e.message : "Erreur inattendue.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
