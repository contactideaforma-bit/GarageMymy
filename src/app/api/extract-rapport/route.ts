import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

export const runtime = "nodejs";
export const maxDuration = 60;

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
  "date_expertise": string|null,         // format AAAA-MM-JJ
  "numero_police": string|null,          // n° de police d'assurance
  "assureur": string|null,               // compagnie d'assurance
  "client_nom": string|null,             // nom et prénom du client / assuré
  "client_adresse": string|null,         // adresse (rue)
  "client_code_postal": string|null,
  "client_ville": string|null,
  "montant": number|null,                // montant total des réparations HT en euros (nombre seul)
  "tva": number|null,                    // taux de TVA en % (ex: 20). null si absent
  "lignes": [                            // détail du chiffrage des réparations (poste par poste)
    { "designation": string, "quantite": number, "prix_unitaire": number }
  ]
}

Règles générales :
- dates au format AAAA-MM-JJ ;
- "montant", "prix_unitaire", "quantite" = nombres sans symbole ni espace, point décimal (ex: 2450.50) ;
- N'invente rien.

Règles pour "lignes" (IMPORTANT — le chiffrage est souvent ÉCLATÉ sur plusieurs pages) :
1. MAIN D'ŒUVRE : cherche le bloc "CONCLUSIONS" (souvent page 1) avec les postes du type
   "Postes / Temps / Taux Hor. / Total HT" (ex: T1, T2, T3, Peinture, Ingrédients (MV), Ingr.).
   Pour chaque poste : designation = nom du poste (ex: "Main d'œuvre T2", "Peinture",
   "Ingrédients peinture"), quantite = nombre d'heures, prix_unitaire = taux horaire HT.
2. PIÈCES — EXHAUSTIVITÉ OBLIGATOIRE : cherche le tableau "LISTE DES PIECES" (souvent sur
   une page SUIVANTE, colonnes du type Qté ! Libellé ! Réf. Constr. ! Opé. ! Mnt HT ! %Vét.
   ! %Rem. ! TVA, colonnes séparées par des "!"). Extrais TOUTES les lignes du tableau, sans
   AUCUNE exception — qu'il y en ait 5 ou 50, chaque ligne du rapport = une ligne extraite :
   - designation = libellé de la pièce (recolle les libellés coupés sur 2 lignes) suivi du
     code opération entre parenthèses s'il existe, ex: "PORTE AR D (R P)", "CAPTEUR EXT. G D'AI (D)" ;
   - quantite = Qté ; prix_unitaire = Mnt HT / Qté si un montant est indiqué, sinon 0
     (les lignes sans montant sont des opérations déjà comprises dans la main d'œuvre :
     elles doivent QUAND MÊME figurer, avec prix_unitaire 0).
3. NE COMPTE PAS DEUX FOIS LES PIÈCES : si les conclusions contiennent une ligne globale
   "Pièces <montant>" ET que tu as trouvé le détail dans "LISTE DES PIECES", n'extrais QUE
   le détail (pas la ligne globale). Si tu n'as PAS trouvé le détail, mets une ligne
   {"designation":"Pièces selon rapport d'expertise","quantite":1,"prix_unitaire": montant_pieces}.
4. VÉRIFICATIONS (fais-les avant de répondre) :
   a) COMPLÉTUDE : compte les lignes du tableau "LISTE DES PIECES" du rapport ; ton JSON
      doit contenir EXACTEMENT le même nombre de lignes de pièces. S'il en manque, recommence.
   b) TOTAL : la somme (quantite × prix_unitaire) de toutes les lignes doit être égale
      (à ±1 € près) au TOTAL HT du rapport (les lignes à 0 ne changent rien). Sinon, corrige.
5. Si le rapport ne donne qu'un montant global sans détail : une seule ligne
   {"designation":"Réparations selon rapport d'expertise","quantite":1,"prix_unitaire": montant_global}.
   Si aucun montant : "lignes": [].`;

export async function POST(req: NextRequest) {
  // SÉCURITÉ : analyse réservée aux utilisateurs connectés (crédits IA).
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

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

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    // maxRetries : le SDK réessaie automatiquement (backoff) sur 429 et 5xx,
    // y compris 529 "overloaded" — souvent transitoire.
    const client = new Anthropic({ apiKey, maxRetries: 4 });
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

    const message = await client.messages.create({
      model,
      max_tokens: 6000,
      messages: [{ role: "user", content }],
    });

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
