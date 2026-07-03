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

Règles :
- dates au format AAAA-MM-JJ ;
- "montant", "prix_unitaire", "quantite" = nombres sans symbole ni espace (ex: 2450.50) ;
- "lignes" : reprends le détail du chiffrage du rapport (main d'œuvre, pièces, peinture, ingrédients peinture, etc.), un poste par ligne, avec son prix unitaire HT et sa quantité. Si le rapport ne donne qu'un montant global, mets une seule ligne {"designation":"Réparations selon rapport d'expertise","quantite":1,"prix_unitaire": montant_global}. Si aucun montant, "lignes": [] ;
- N'invente rien.`;

export async function POST(req: NextRequest) {
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
      max_tokens: 1500,
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
