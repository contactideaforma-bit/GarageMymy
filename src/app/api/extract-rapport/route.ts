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
  "montant": number|null                 // montant total des réparations HT ou TTC en euros (nombre seul)
}

Règles : dates au format AAAA-MM-JJ. "montant" = nombre sans symbole ni espace (ex: 2450.50). N'invente rien.`;

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

    const client = new Anthropic({ apiKey });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const documentBlock = isPdf
      ? {
          type: "document" as const,
          source: { type: "base64" as const, media_type: "application/pdf" as const, data: base64 },
        }
      : {
          type: "image" as const,
          source: {
            type: "base64" as const,
            media_type: (file.type || "image/jpeg") as
              | "image/jpeg"
              | "image/png"
              | "image/webp"
              | "image/gif",
            data: base64,
          },
        };

    const message = await client.messages.create({
      model,
      max_tokens: 1500,
      messages: [
        {
          role: "user",
          content: [documentBlock, { type: "text", text: PROMPT }],
        },
      ],
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
    const msg = err instanceof Error ? err.message : "Erreur d'extraction.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
