import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { avecDelai, DelaiDepasse } from "@/lib/delai";
import { texteDuPdf } from "@/lib/pdfTexte";
import { jsonDepuisTexte, preparerAppelIA, texte } from "@/lib/expertise/serveur";

/* ==================================================================
 *  IMPORT D'UNE LISTE (PDF / image) POUR L'ANNUAIRE EXPERT (v13.6)
 *  Un PDF de contacts (liste d'assureurs, de garages agréés, de clients),
 *  une photo d'un tableau… → l'IA en extrait les fiches. Un PDF avec
 *  calque texte n'est envoyé qu'en texte (rapide et économique).
 * ================================================================== */

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 50_000;
const TEXTE_MAX = 40000;

const PROMPT = (categorie: string) => `Tu extrais une LISTE DE CONTACTS d'un document pour l'annuaire d'un cabinet d'expertise automobile.
Catégorie attendue : ${categorie === "assurances" ? "compagnies / courtiers d'assurance (mandants)" : categorie === "clients" ? "clients (particuliers ou sociétés propriétaires de véhicules)" : "garages / carrosseries (réparateurs)"}.
Renvoie UNIQUEMENT cet objet JSON (aucun texte autour, pas de markdown), une entrée par contact, dans l'ordre du document :
{"fiches":[{"nom":string,"adresse":string|null,"code_postal":string|null,"ville":string|null,"siren":string|null,"siret":string|null,"tel":string|null,"email":string|null,"contact":string|null,"notes":string|null,"type":"particulier"|"societe"|null}]}
Règles : "nom" = raison sociale ou nom complet ; "adresse" = voie seule (le code postal et la ville vont dans leurs champs) ; téléphones au format 0X XX XX XX XX ; SIREN 9 chiffres, SIRET 14 chiffres, sans espaces ; "contact" = interlocuteur ; "notes" = agrément, horaires, remarque utile (court). N'invente rien : null si absent. Jusqu'à 300 fiches.`;

export async function POST(req: NextRequest) {
  const prep = await preparerAppelIA(req);
  if (!prep.ok) return prep.reponse;
  try {
    const form = await req.formData();
    const categorie = String(form.get("categorie") || "garages");
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    let calque = "";
    if (isPdf) { try { calque = texteDuPdf(bytes).trim(); } catch { calque = ""; } }
    const blocs: unknown[] = [];
    if (calque.length > 100) {
      blocs.push({ type: "text", text: `-----DÉBUT DU DOCUMENT-----\n${calque.slice(0, TEXTE_MAX)}\n-----FIN DU DOCUMENT-----` });
    } else {
      const b64 = bytes.toString("base64");
      blocs.push(isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } });
    }
    blocs.push({ type: "text", text: PROMPT(categorie) });
    const message = await avecDelai(
      prep.client.messages.create({ model: prep.model, max_tokens: 8000, messages: [{ role: "user", content: blocs as unknown as Anthropic.MessageParam["content"] }] }),
      BUDGET_MS
    );
    await prep.enregistrer(message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);
    const part = message.content.find((c) => c.type === "text");
    const brut = jsonDepuisTexte(part && "text" in part ? part.text : "") as { fiches?: unknown[] } | null;
    if (!brut || !Array.isArray(brut.fiches)) return NextResponse.json({ error: "Aucune liste reconnue dans ce fichier." }, { status: 422 });
    const fiches = brut.fiches.map((f) => {
      const x = f as Record<string, unknown>;
      const siret = (texte(x.siret, 20) || "").replace(/\D/g, "") || null;
      const t = texte(x.type, 12);
      return {
        nom: texte(x.nom, 120) || "",
        adresse: texte(x.adresse, 200), code_postal: (texte(x.code_postal, 10) || "").replace(/\D/g, "") || null, ville: texte(x.ville, 80),
        siren: (texte(x.siren, 20) || "").replace(/\D/g, "") || (siret ? siret.slice(0, 9) : null), siret,
        tel: texte(x.tel, 30), email: (texte(x.email, 120) || "").toLowerCase() || null, contact: texte(x.contact, 120), notes: texte(x.notes, 300),
        type: t === "societe" || t === "particulier" ? t : null,
      };
    }).filter((f) => f.nom).slice(0, 300);
    return NextResponse.json({ data: { fiches } });
  } catch (e) {
    if (e instanceof DelaiDepasse) return NextResponse.json({ error: "La lecture a dépassé le temps autorisé : découpe le document et réessaie." }, { status: 504 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inattendue." }, { status: 500 });
  }
}
