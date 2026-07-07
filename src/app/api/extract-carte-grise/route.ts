import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";

// Extraction IA d'une CARTE GRISE (photo ou PDF) → JSON pour pré-remplir
// l'ajout d'un véhicule (flotte du garage).

export const runtime = "nodejs";
export const maxDuration = 60;

const PROMPT = `Tu lis un certificat d'immatriculation français (carte grise), photographié ou scanné.
Extrais les champs suivants et renvoie UNIQUEMENT un objet JSON valide (aucun texte autour), null si illisible/absent :

{
  "immatriculation": string|null,        // champ A, format AA-123-AA
  "marque": string|null,                 // champ D.1
  "modele": string|null,                 // champ D.3 (ou dénomination commerciale)
  "numero_serie": string|null,           // champ E (VIN, 17 caractères)
  "premiere_circulation": string|null,   // champ B, format AAAA-MM-JJ
  "titulaire": string|null               // champ C.1 (nom et prénom du titulaire)
}

Règles : n'invente rien ; corrige l'orientation/qualité mentalement ; l'immatriculation en MAJUSCULES avec tirets.`;

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

    const bytes = Buffer.from(await file.arrayBuffer());
    const base64 = bytes.toString("base64");
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    const client = new Anthropic({ apiKey, maxRetries: 4 });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

    const documentBlock = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
      : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } };

    const content = [
      documentBlock,
      { type: "text", text: PROMPT },
    ] as unknown as Anthropic.MessageParam["content"];

    const message = await client.messages.create({
      model,
      max_tokens: 500,
      messages: [{ role: "user", content }],
    });

    await enregistrerUsage(user.id, message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);

    const textPart = message.content.find((c) => c.type === "text");
    const raw = textPart && "text" in textPart ? textPart.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return NextResponse.json({ error: "Carte grise illisible : réessaie avec une photo plus nette." }, { status: 422 });
    }
    return NextResponse.json({ data: JSON.parse(match[0]) });
  } catch (err: unknown) {
    const anyErr = err as { status?: number; message?: string };
    const overloaded =
      anyErr?.status === 529 ||
      anyErr?.status === 429 ||
      (typeof anyErr?.message === "string" && anyErr.message.toLowerCase().includes("overloaded"));
    if (overloaded) {
      return NextResponse.json(
        { error: "Le service d'analyse IA est momentanément surchargé. Réessaie dans quelques secondes." },
        { status: 503 }
      );
    }
    const msg = err instanceof Error ? err.message : "Erreur d'extraction.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
