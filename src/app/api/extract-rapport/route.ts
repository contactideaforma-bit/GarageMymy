import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DelaiDepasse, avecDelai } from "@/lib/delai";

export const runtime = "nodejs";
export const maxDuration = 60;

// On coupe NOUS-MÊMES avant la limite de la plateforme : au-delà, Vercel tue
// la fonction et renvoie une PAGE HTML d'erreur — le navigateur affichait
// alors « Unexpected token 'A', "An error o"… is not valid JSON ».
const BUDGET_MS = 50_000;

const PROMPT = `Tu es un assistant pour une carrosserie. On te fournit un RAPPORT D'EXPERTISE automobile (PDF).
Extrais TOUTES les informations utiles et renvoie UNIQUEMENT un objet JSON valide (aucun texte autour), avec exactement ces clés (mets null si absent) :

{
  "immatriculation": string|null,
  "marque_modele": string|null,          // marque + modèle réunis, ex: "Peugeot 308 SW"
  "numero_serie": string|null,           // VIN / n° de série
  "premiere_circulation": string|null,   // format AAAA-MM-JJ
  "date_sinistre": string|null,          // format AAAA-MM-JJ
  "numero_sinistre": string|null,
  "cabinet_expert": string|null,         // nom du cabinet d'expertise
  "cabinet_adresse": string|null,        // adresse du cabinet (souvent dans l'EN-TÊTE du rapport)
  "cabinet_tel": string|null,            // téléphone du cabinet
  "cabinet_email": string|null,          // email du cabinet
  "expert_nom": string|null,             // nom de l'EXPERT en charge (souvent "Vu par" ou signature)
  "expert_tel": string|null,             // téléphone de l'expert s'il est distinct du cabinet
  "expert_email": string|null,           // email de l'expert s'il est distinct du cabinet
  "date_expertise": string|null,         // format AAAA-MM-JJ
  "numero_police": string|null,          // n° de police d'assurance
  "assureur": string|null,               // compagnie d'assurance (souvent bloc "MANDANT")
  "assureur_adresse": string|null,       // adresse de l'assurance (bloc MANDANT)
  "assureur_tel": string|null,           // téléphone de l'assurance
  "assureur_email": string|null,         // email de l'assurance
  "client_nom": string|null,             // nom et prénom du client / assuré
  "client_email": string|null,           // email du client s'il figure au rapport
  "client_tel": string|null,             // téléphone du client s'il figure au rapport
  "client_adresse": string|null,         // adresse (rue)
  "client_code_postal": string|null,
  "client_ville": string|null,
  "montant": number|null,                // montant total des réparations HT en euros (nombre seul)
  "tva": number|null,                    // taux de TVA en % (ex: 20). null si absent
  "lignes": [                            // détail du chiffrage des réparations (poste par poste)
    {
      "designation": string,
      "quantite": number,
      "prix_unitaire": number,           // PU HT AVANT remise
      "remise": number,                  // % de remise accordée (colonne "%Rem."), 0 si aucune
      "categorie": "piece"|"mo"|"autre"  // voir règles ci-dessous
    }
  ]
}

Règles générales :
- dates au format AAAA-MM-JJ ;
- "montant", "prix_unitaire", "quantite" = nombres sans symbole ni espace, point décimal (ex: 2450.50) ;
- N'invente rien.

Règles pour les COORDONNÉES (IMPORTANT — extrais-les TOUTES quand elles figurent au rapport) :
- CABINET D'EXPERTISE : ses coordonnées (adresse, tél, email) sont presque toujours dans
  l'EN-TÊTE du rapport (logo/adresse en haut). L'expert en charge est souvent indiqué par
  "Vu par", "Expert :" ou dans la signature.
- ASSURANCE : cherche le bloc "MANDANT" (nom + adresse de la compagnie, parfois tél/fax).
- CLIENT : cherche le bloc "ASSURÉ" ou "LÉSÉ" (nom, adresse, CP, ville, tél, email).
- ATTENTION à ne PAS confondre : le bloc "RÉPARATEUR" est le GARAGE (ne le mets nulle part),
  et l'adresse du cabinet n'est pas celle de l'assurance.
- Les téléphones au format lisible (ex: 04 69 42 01 80 ou 0469420180, garde tel quel).

Règles pour "categorie" (la facture est structurée en 3 tableaux) :
- "mo"    : postes de main d'œuvre et de peinture — T1, T2, T3, Peinture, Ingrédients de
            peinture. Les INGRÉDIENTS DE PEINTURE ont TOUJOURS la même quantité (le même
            temps) que la ligne Peinture : recopie-la si le rapport ne la répète pas.
- "autre" : éléments annexes retenus au rapport qui ne sont ni une pièce ni un temps de
            main d'œuvre (forfaits, petites fournitures, frais de gestion/recyclage,
            calibrage, contrôle de géométrie, produits, etc.).
- "piece" : tout le reste (pièces détachées et fournitures) — c'est le cas par défaut.

Règles pour "lignes" (IMPORTANT — le chiffrage est souvent ÉCLATÉ sur plusieurs pages) :
1. MAIN D'ŒUVRE : cherche le bloc "CONCLUSIONS" (souvent page 1) avec les postes du type
   "Postes / Temps / Taux Hor. / Total HT" (ex: T1, T2, T3, Peinture, Ingrédients (MV), Ingr.).
   Pour chaque poste : designation = nom du poste (ex: "Main d'œuvre T2", "Peinture",
   "Ingrédients peinture"), quantite = nombre d'heures, prix_unitaire = taux horaire HT,
   categorie = "mo".
2. PIÈCES — EXHAUSTIVITÉ OBLIGATOIRE : cherche le tableau "LISTE DES PIECES" (souvent sur
   une page SUIVANTE, colonnes du type Qté ! Libellé ! Réf. Constr. ! Opé. ! Mnt HT ! %Vét.
   ! %Rem. ! TVA, colonnes séparées par des "!"). Extrais TOUTES les lignes du tableau, sans
   AUCUNE exception — qu'il y en ait 5 ou 50, chaque ligne du rapport = une ligne extraite :
   - designation = libellé de la pièce (recolle les libellés coupés sur 2 lignes) suivi du
     code opération entre parenthèses s'il existe, ex: "PORTE AR D (R P)", "CAPTEUR EXT. G D'AI (D)" ;
   - quantite = Qté ; prix_unitaire = Mnt HT / Qté si un montant est indiqué, sinon 0
     (les lignes sans montant sont des opérations déjà comprises dans la main d'œuvre :
     elles doivent QUAND MÊME figurer, avec prix_unitaire 0) ;
   - remise = valeur de la colonne "%Rem." (remise commerciale accordée), 0 si vide.
     NE CONFONDS PAS avec "%Vét." (vétusté) : la vétusté n'est PAS une remise, ignore-la.
     Si le montant "Mnt HT" du rapport est déjà NET de remise, mets remise = 0 pour ne
     pas déduire deux fois ;
   - categorie = "piece" (sauf élément annexe → "autre").
3. NE COMPTE PAS DEUX FOIS LES PIÈCES : si les conclusions contiennent une ligne globale
   "Pièces <montant>" ET que tu as trouvé le détail dans "LISTE DES PIECES", n'extrais QUE
   le détail (pas la ligne globale). Si tu n'as PAS trouvé le détail, mets une ligne
   {"designation":"Pièces selon rapport d'expertise","quantite":1,"prix_unitaire": montant_pieces}.
4. VÉRIFICATIONS (fais-les avant de répondre) :
   a) COMPLÉTUDE : compte les lignes du tableau "LISTE DES PIECES" du rapport ; ton JSON
      doit contenir EXACTEMENT le même nombre de lignes de pièces. S'il en manque, recommence.
   b) TOTAL : la somme des (quantite × prix_unitaire × (1 − remise/100)) de toutes les
      lignes doit être égale (à ±1 € près) au TOTAL HT du rapport (les lignes à 0 ne
      changent rien). Sinon, corrige.
   c) PEINTURE : si une ligne "Ingrédients" existe, sa quantite doit être IDENTIQUE à
      celle de la ligne "Peinture".
5. RÉPONSE : uniquement le JSON, en COMPACT (aucun espace ni retour à la ligne
   superflu, pas de bloc markdown). Le rapport peut être un SCAN (pages images) :
   lis-le tel quel, ne commente pas la qualité de l'image.
6. Si le rapport ne donne qu'un montant global sans détail : une seule ligne
   {"designation":"Réparations selon rapport d'expertise","quantite":1,
    "prix_unitaire": montant_global,"remise":0,"categorie":"piece"}.
   Si aucun montant : "lignes": [].`;

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

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Clé ANTHROPIC_API_KEY manquante. Ajoute-la dans .env.local (et sur Vercel)." },
      { status: 500 }
    );
  }

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

    // maxRetries VOLONTAIREMENT BAS (1) : chaque nouvelle tentative consomme le
    // budget de la fonction serverless. Avec 4 essais, un rapport un peu long
    // faisait systématiquement expirer la requête côté hébergeur.
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

    // Le bloc "document" (PDF) n'est pas encore typé dans certaines versions du SDK,
    // mais l'API l'accepte : on contourne le typage via un cast.
    const content = [
      documentBlock,
      { type: "text", text: PROMPT },
    ] as unknown as Anthropic.MessageParam["content"];

    const message = await avecDelai(
      client.messages.create({
        model,
        max_tokens: 6000,
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
        { error: "Extraction impossible : réponse non exploitable.", raw },
        { status: 422 }
      );
    }

    const data = JSON.parse(match[0]);
    return NextResponse.json({ data });
  } catch (err: unknown) {
    if (err instanceof DelaiDepasse) {
      return NextResponse.json(
        {
          error:
            "L'analyse a pris trop de temps et a été interrompue. Ce rapport est un SCAN " +
            "(pages en images) ou comporte beaucoup de pages : l'IA doit tout relire. " +
            "Réessaie une fois — souvent ça passe —, sinon n'envoie que les pages utiles " +
            "(conclusions + liste des pièces), ou saisis le dossier à la main.",
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
