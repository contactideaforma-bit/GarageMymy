import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DelaiDepasse, avecDelai } from "@/lib/delai";
import { appliquerRegles, blocRegles } from "@/lib/apprentissage";
import { IaRegle } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

// On coupe NOUS-MÊMES avant la limite de la plateforme : au-delà, Vercel tue
// la fonction et renvoie une PAGE HTML d'erreur — le navigateur affichait
// alors « Unexpected token 'A', "An error o"… is not valid JSON ».
const BUDGET_MS = 50_000;

/* ==================================================================
 *  ANALYSE EN DEUX APPELS (v6.9)
 *
 *  Le temps d'une analyse est dominé par les TOKENS DE SORTIE : sur un
 *  rapport scanné, extraire d'un coup les identités ET les 30-60 lignes de
 *  chiffrage dépassait systématiquement les 60 s de la fonction serverless.
 *
 *  Le navigateur lance donc DEUX requêtes EN PARALLÈLE :
 *    - ?partie=identite  → véhicule, client, assurance, expert (sortie courte)
 *    - ?partie=chiffrage → montant, TVA et les lignes (sortie compacte)
 *  Deux requêtes = deux invocations = DEUX budgets de 60 s, et chacune produit
 *  deux fois moins de texte. Si l'une échoue, l'autre reste exploitable
 *  (analyse partielle plutôt qu'échec total).
 *
 *  ?partie=complet reste disponible (compatibilité / usage hors navigateur).
 * ================================================================== */

const REGLES_COMMUNES = `Le document peut être un SCAN (pages en images) : lis-le tel quel, ne commente jamais la qualité de l'image.
Réponds UNIQUEMENT par le JSON demandé, en COMPACT (aucun espace ni retour à la ligne superflu, aucun bloc markdown, aucun commentaire).
Dates au format AAAA-MM-JJ. Nombres sans symbole ni espace, point décimal (ex: 2450.50). N'invente rien : null si absent.`;

const PROMPT_IDENTITE = `Tu es un assistant pour une carrosserie. On te fournit un RAPPORT D'EXPERTISE automobile.
Extrais UNIQUEMENT les informations d'identité (PAS le chiffrage, PAS la liste des pièces) et renvoie cet objet JSON :

{
"immatriculation":string|null,
"marque_modele":string|null,
"numero_serie":string|null,
"premiere_circulation":string|null,
"date_sinistre":string|null,
"numero_sinistre":string|null,
"cabinet_expert":string|null,
"cabinet_adresse":string|null,
"cabinet_tel":string|null,
"cabinet_email":string|null,
"expert_nom":string|null,
"expert_tel":string|null,
"expert_email":string|null,
"date_expertise":string|null,
"numero_police":string|null,
"assureur":string|null,
"assureur_adresse":string|null,
"assureur_tel":string|null,
"assureur_email":string|null,
"client_nom":string|null,
"client_email":string|null,
"client_tel":string|null,
"client_adresse":string|null,
"client_code_postal":string|null,
"client_ville":string|null
}

Où chercher :
- CABINET D'EXPERTISE : coordonnées presque toujours dans l'EN-TÊTE (logo/adresse en haut).
  L'expert en charge est signalé par "Vu par", "Expert :" ou la signature.
- ASSURANCE : bloc "MANDANT" (nom + adresse, parfois tél/fax).
- CLIENT : bloc "ASSURÉ" ou "LÉSÉ" (nom, adresse, CP, ville, tél, email).
- ATTENTION : le bloc "RÉPARATEUR" est le GARAGE — ne le mets nulle part.
  L'adresse du cabinet n'est pas celle de l'assurance.
- Téléphones gardés tels quels (ex: 04 69 42 01 80).

${REGLES_COMMUNES}`;

const PROMPT_CHIFFRAGE = `Tu es un assistant pour une carrosserie. On te fournit un RAPPORT D'EXPERTISE automobile.
Extrais UNIQUEMENT le CHIFFRAGE (aucune information d'identité) et renvoie cet objet JSON :

{"montant":number|null,"tva":number|null,"l":[[designation,quantite,prix_unitaire,remise,categorie],...]}

CE QUE TU PRODUIS DEVIENT UNE FACTURE, telle quelle, sans relecture ligne à ligne.
La facture reprend le rapport en TROIS tableaux, et rien d'autre :
  "p" → tableau 1 « Pièces, fournitures & prestations » (Désignation / Qté / PU HT / Remise / Total HT) ;
  "m" → tableau 2 « Main d'œuvre & peinture », LISTE FERMÉE : T1, T2, T3, Peinture, Ingrédients de peinture ;
  "a" → tableau 3 « Autres éléments retenus au rapport ».
Une ligne oubliée, un taux recalculé « au jugé » ou une remise confondue avec une
vétusté produisent une facture FAUSSE envoyée à l'assurance. Dans le doute :
recopie le rapport, ne l'interprète pas, n'arrondis rien, n'invente aucune ligne.

- "montant" = total des réparations HT ; "tva" = taux en % (ex: 20), null si absent.
- Chaque ligne est un TABLEAU de 5 valeurs, dans cet ordre exact :
  [designation:string, quantite:number, prix_unitaire:number, remise:number, categorie:"m"|"p"|"a"]
  Ce format court est OBLIGATOIRE (il divise par deux la longueur de ta réponse).
- categorie "m" = LISTE FERMÉE : UNIQUEMENT T1, T2, T3, Peinture et Ingrédients de
  peinture. Rien d'autre ne prend "m" — une main d'œuvre générique, de la tôlerie,
  un forfait ou une prestation annexe prennent "a". Les pièces prennent "p".

1. POSTES ("m") : bloc "CONCLUSIONS" (souvent page 1), tableau du type
   "Postes / Temps / Taux Hor. / Total HT" (T1, T2, T3, Peinture, Ingrédients (MV), Ingr.).
   - quantite = le NOMBRE D'HEURES EXACT lu dans la colonne "Temps" ;
   - prix_unitaire = le TAUX HORAIRE EXACT lu dans la colonne "Taux Hor." ;
   - RECOPIE ces deux nombres tels quels, ne les recalcule JAMAIS depuis le total.
   - "Ingrédients (de peinture)" : sa quantite est TOUJOURS identique à celle de
     "Peinture", MAIS son TAUX HORAIRE EST DIFFÉRENT — reprends celui du rapport,
     ne recopie pas le taux de la peinture.
   - Vérifie poste par poste : quantite × prix_unitaire = Total HT de la ligne.
2. PIÈCES ("p") — EXHAUSTIVITÉ OBLIGATOIRE : tableau "LISTE DES PIECES" (souvent sur une
   page suivante, colonnes Qté ! Libellé ! Réf. Constr. ! Opé. ! Mnt HT ! %Vét. ! %Rem. ! TVA,
   séparées par des "!"). Extrais TOUTES les lignes, sans AUCUNE exception :
   - designation = libellé (recolle les libellés coupés sur 2 lignes) + code opération entre
     parenthèses s'il existe, ex: "PORTE AR D (R P)" ;
   - quantite = Qté ; prix_unitaire = Mnt HT / Qté, ou 0 si aucun montant (opération déjà
     comprise dans la main d'œuvre : la ligne doit QUAND MÊME figurer, avec 0) ;
   - remise = colonne "%Rem." (0 si vide). NE CONFONDS PAS avec "%Vét." (vétusté) : la
     vétusté n'est PAS une remise, ignore-la. Si le "Mnt HT" est déjà net de remise, mets 0.
3. AUTRES ("a") : forfaits, petites fournitures, frais de gestion/recyclage, calibrage,
   contrôle de géométrie, produits divers.
4. NE COMPTE PAS DEUX FOIS LES PIÈCES : si les conclusions donnent un total "Pièces" ET que
   le détail existe, n'extrais QUE le détail. Sans détail : ["Pièces selon rapport d'expertise",1,montant_pieces,0,"p"].
5. VÉRIFICATIONS avant de répondre — fais-les VRAIMENT, dans cet ordre :
   a) autant de lignes de pièces que dans le tableau du rapport ;
   b) poste par poste : quantite × prix_unitaire = le Total HT imprimé sur la ligne ;
   c) somme des (quantite × prix_unitaire × (1 − remise/100)) = TOTAL HT du rapport
      à ±1 € près. C'est la vérification LA PLUS IMPORTANTE : le total facturé doit
      correspondre au rapport. Si l'écart dépasse 1 €, NE RENDS PAS ta réponse :
      reprends la lecture des heures, des taux horaires et des montants de pièces,
      cherche la ligne oubliée ou le chiffre mal lu, corrige, puis recompte.
   d) chaque poste "m" est bien l'un de : T1, T2, T3, Peinture, Ingrédients —
      et il n'y a AUCUN doublon (une même pièce ne figure qu'une fois).
6. Si le rapport ne donne qu'un montant global : [["Réparations selon rapport d'expertise",1,montant_global,0,"p"]].
   Si aucun montant : "l":[].

${REGLES_COMMUNES}`;

// Mode « complet » : conservé pour un usage hors navigateur (script, test).
// L'application, elle, appelle TOUJOURS les deux moitiés en parallèle.
const PROMPT_COMPLET = `${PROMPT_IDENTITE.replace(
  "Extrais UNIQUEMENT les informations d'identité (PAS le chiffrage, PAS la liste des pièces) et renvoie cet objet JSON :",
  "Extrais les informations d'identité ET le chiffrage, et renvoie cet objet JSON :"
)}

Ajoute dans le MÊME objet les clés du chiffrage :
"montant":number|null,"tva":number|null,"l":[[designation,quantite,prix_unitaire,remise,"m"|"p"|"a"],...]

${PROMPT_CHIFFRAGE.replace(
  "Extrais UNIQUEMENT le CHIFFRAGE (aucune information d'identité) et renvoie cet objet JSON :",
  "Règles du chiffrage :"
)}`;

type Partie = "identite" | "chiffrage" | "complet";

const CATEGORIES: Record<string, string> = { m: "mo", p: "piece", a: "autre" };

type LigneExtraite = {
  designation: string;
  quantite: number;
  prix_unitaire: number;
  remise: number;
  categorie: string;
};

// Le format court [designation, qte, pu, remise, cat] revient au format
// attendu par l'application (lib/documents.ts).
function developperLignes(brut: unknown): LigneExtraite[] {
  if (!Array.isArray(brut)) return [];
  return brut
    .map((l): LigneExtraite | null => {
      if (Array.isArray(l)) {
        return {
          designation: String(l[0] ?? "Prestation"),
          quantite: Number(l[1]) || 0,
          prix_unitaire: Number(l[2]) || 0,
          remise: Number(l[3]) || 0,
          categorie: CATEGORIES[String(l[4] || "p")] || "piece",
        };
      }
      // Tolérance : si le modèle renvoie quand même des objets détaillés.
      if (l && typeof l === "object") {
        const o = l as Record<string, unknown>;
        const cat = String(o.categorie ?? "piece");
        return {
          designation: String(o.designation ?? "Prestation"),
          quantite: Number(o.quantite) || 0,
          prix_unitaire: Number(o.prix_unitaire) || 0,
          remise: Number(o.remise) || 0,
          categorie: CATEGORIES[cat] || (["piece", "mo", "autre"].includes(cat) ? cat : "piece"),
        };
      }
      return null;
    })
    .filter((l): l is LigneExtraite => l !== null);
}

const centimes = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * CONTRÔLE DE COHÉRENCE (v7.7) — la somme des lignes extraites doit retomber
 * sur le TOTAL HT du rapport. C'est LE garde-fou contre une facture fausse :
 * on ne corrige rien automatiquement (l'humain tranche), mais on le dit.
 *
 * Effet de bord utile : si le modèle n'a pas su lire le total global alors
 * qu'il a lu le détail, on renseigne le montant depuis la somme des lignes —
 * sinon le dossier partait avec un montant vide et plus aucun contrôle.
 */
function controlerChiffrage(lignes: LigneExtraite[], montantBrut: unknown) {
  const somme = centimes(
    lignes.reduce(
      (s, l) =>
        s + l.quantite * l.prix_unitaire * (1 - Math.min(100, Math.max(0, l.remise || 0)) / 100),
      0
    )
  );
  const ref = Number(montantBrut);
  const montantConnu = Number.isFinite(ref) && ref > 0;
  const montant = montantConnu ? centimes(ref) : somme > 0 ? somme : null;
  const ecart = montantConnu ? centimes(somme - ref) : 0;
  return {
    montant,
    somme,
    ecart,
    coherent: Math.abs(ecart) <= 1,
    /** true quand le montant a été déduit de la somme des lignes. */
    montantDeduit: !montantConnu && somme > 0,
  };
}

export async function POST(req: NextRequest) {
  // SÉCURITÉ : analyse réservée aux utilisateurs connectés (crédits IA).
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  // QUOTA : 15 €/mois par utilisateur (+ crédits achetés)
  const { etatQuota, enregistrerUsage, MESSAGE_QUOTA_DEPASSE } = await import("@/lib/quotaIA");
  const quota = await etatQuota(user.id);
  if (quota.depasse) {
    return NextResponse.json({ error: MESSAGE_QUOTA_DEPASSE }, { status: 402 });
  }

  // MÉMOIRE DE L'ANALYSE : les règles apprises des corrections du garage
  // sont ajoutées au prompt ET appliquées aux lignes extraites (v7.7).
  let regles: IaRegle[] = [];
  try {
    const { chargerReglesServeur } = await import("@/lib/apprentissageServeur");
    regles = await chargerReglesServeur(user.id);
  } catch {
    /* mémoire indisponible : on analyse sans */
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé ANTHROPIC_API_KEY manquante. Ajoute-la dans .env.local (et sur Vercel)." },
      { status: 500 }
    );
  }

  const partieBrute = req.nextUrl.searchParams.get("partie") || "complet";
  const partie: Partie =
    partieBrute === "identite" || partieBrute === "chiffrage" ? partieBrute : "complet";

  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    }
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // maxRetries VOLONTAIREMENT BAS : chaque nouvelle tentative consomme le
    // budget de la fonction serverless.
    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const documentBlock = isPdf
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        }
      : {
          type: "image",
          source: {
            type: "base64",
            media_type: file.type || "image/jpeg",
            data: base64,
          },
        };

    const base =
      partie === "identite" ? PROMPT_IDENTITE : partie === "chiffrage" ? PROMPT_CHIFFRAGE : PROMPT_COMPLET;
    // Les règles apprises ne concernent que le chiffrage (libellés, tableaux,
    // taux) : inutile d'alourdir le prompt d'identité avec.
    const prompt = partie === "identite" ? base : base + blocRegles(regles);

    // Le bloc "document" (PDF) n'est pas encore typé dans certaines versions du SDK,
    // mais l'API l'accepte : on contourne le typage via un cast.
    const content = [
      documentBlock,
      { type: "text", text: prompt },
    ] as unknown as Anthropic.MessageParam["content"];

    // Sortie plafonnée selon la partie : les identités tiennent largement en
    // 1200 tokens, inutile de laisser la porte ouverte à une réponse bavarde.
    const maxTokens = partie === "identite" ? 1500 : 6000;

    const message = await avecDelai(
      client.messages.create({
        model,
        max_tokens: maxTokens,
        messages: [{ role: "user", content }],
      }),
      BUDGET_MS
    );

    // Comptabilise la consommation (tokens réels de l'appel)
    await enregistrerUsage(user.id, message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);

    const textPart = message.content.find((c) => c.type === "text");
    const raw = textPart && "text" in textPart ? textPart.text : "";

    // Récupère le JSON même s'il est entouré de texte
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json(
        { error: "Extraction impossible : réponse non exploitable.", raw: raw.slice(0, 400) },
        { status: 422 }
      );
    }

    let data: Record<string, unknown>;
    try {
      data = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      // Réponse tronquée (limite de tokens atteinte sur un très gros chiffrage)
      return NextResponse.json(
        {
          error:
            "Le chiffrage du rapport est trop volumineux pour être lu d'un seul tenant. " +
            "Envoie séparément la page des conclusions et celle de la liste des pièces, " +
            "ou complète les lignes à la main dans le devis.",
        },
        { status: 422 }
      );
    }

    // Format court → format applicatif, puis application des règles apprises
    // (libellés et tableau d'affectation UNIQUEMENT — jamais les montants).
    if (data.l !== undefined) {
      const brutes = developperLignes(data.l);
      const { lignes, appliquees } = appliquerRegles(brutes, regles);
      data.lignes = lignes;
      data.regles_appliquees = appliquees;
      delete data.l;

      // Le total des lignes doit retomber sur le total HT du rapport.
      const controle = controlerChiffrage(lignes, data.montant);
      if (controle.montant != null) data.montant = controle.montant;
      data.controle = controle;
    }

    return NextResponse.json({ data, partie });
  } catch (err: unknown) {
    if (err instanceof DelaiDepasse) {
      return NextResponse.json(
        {
          error:
            partie === "chiffrage"
              ? "Le chiffrage n'a pas pu être lu dans le temps imparti (rapport scanné ou très détaillé). " +
                "Les informations du dossier, elles, ont pu être récupérées : complète le montant et les " +
                "lignes à la main, ou réessaie l'analyse."
              : "L'analyse a pris trop de temps et a été interrompue. Réessaie une fois — souvent ça passe —, " +
                "sinon n'envoie que les pages utiles (conclusions + liste des pièces), ou saisis le dossier à la main.",
        },
        { status: 504 }
      );
    }
    const anyErr = err as { status?: number; message?: string };
    const status = anyErr?.status;
    const overloaded =
      status === 529 ||
      status === 429 ||
      (typeof anyErr?.message === "string" && anyErr.message.toLowerCase().includes("overloaded"));
    if (overloaded) {
      return NextResponse.json(
        {
          error:
            "Le service d'analyse IA est momentanément surchargé. Réessaie dans quelques secondes.",
        },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erreur d'extraction.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
