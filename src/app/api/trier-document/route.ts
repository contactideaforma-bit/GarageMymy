import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { DelaiDepasse, avecDelai } from "@/lib/delai";
import { texteDuPdf } from "@/lib/pdfTexte";

/* ==================================================================
 *  TRI D'UN DOCUMENT DÉPOSÉ À L'IMPORT (v13.0)
 *
 *  Reprise d'un dossier en cours : le garage dépose PLUSIEURS fichiers
 *  (rapport, facture déjà faite ailleurs, carte grise, constat…). Cette
 *  route dit, pour UN fichier, de quoi il s'agit — et, si c'est une
 *  facture, en lit l'en-tête et les totaux (PAS les lignes : la facture
 *  extérieure est conservée telle quelle, jamais reconstruite).
 *
 *  ÉCONOMIE : un PDF qui a un calque texte n'est PAS envoyé en image.
 *  On n'envoie que le début de son texte — quelques centimes de moins par
 *  fichier et une réponse en 2-3 s. Seuls les scans / photos partent en
 *  image.
 * ================================================================== */

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 45_000;
/** Assez pour l'en-tête + le pied (totaux) d'une facture de 2-3 pages. */
const TEXTE_MAX = 9000;

const TYPES = ["rapport", "facture", "carte_grise", "constat", "permis", "prise_en_charge", "autre"] as const;

const PROMPT = `Tu tries les documents qu'une carrosserie dépose pour créer un dossier sinistre.
Dis de QUEL document il s'agit, et — UNIQUEMENT si c'est une facture — lis son en-tête et ses totaux.
Renvoie UNIQUEMENT cet objet JSON compact (aucun texte autour, aucun markdown) :

{"type":"rapport"|"facture"|"carte_grise"|"constat"|"permis"|"prise_en_charge"|"autre",
"facture":null|{"numero":string|null,"date_document":string|null,"date_echeance":string|null,"total_ht":number|null,"total_tva":number|null,"total_ttc":number|null,"tva":number|null,"immatriculation":string|null,"marque_modele":string|null,"client_nom":string|null,"numero_sinistre":string|null,"assureur":string|null}}

Comment reconnaître :
- "rapport" = rapport d'expertise automobile (cabinet d'expert, « Vu par », chiffrage T1/T2/T3, mandant, lésé…).
- "facture" = facture ÉMISE PAR LE GARAGE / la carrosserie pour la réparation (mot « FACTURE », numéro, totaux HT/TVA/TTC). Un DEVIS ou une facture d'un FOURNISSEUR de pièces n'est PAS une facture du dossier → "autre".
- "carte_grise" = certificat d'immatriculation. "constat" = constat amiable. "permis" = permis de conduire.
- "prise_en_charge" = accord / bon de prise en charge ou ordre de mission de l'assureur.
- Tout le reste (photos du véhicule, devis, courrier…) = "autre".

Pour la facture : "tva" = taux en % (ex: 20). Dates AAAA-MM-JJ. Nombres avec point décimal, sans symbole ni espace.
"date_echeance" seulement si elle est imprimée. "client_nom" = le destinataire facturé (pas le garage).
N'invente rien : null si absent ou illisible.`;

function nombre(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}
function texte(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return t ? t.slice(0, 200) : null;
}
function date(v: unknown): string | null {
  const t = typeof v === "string" ? v.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null;
}

export async function POST(req: NextRequest) {
  // SÉCURITÉ : analyse réservée aux utilisateurs connectés (crédits IA).
  const { utilisateurDepuisRequete, REPONSE_401 } = await import("@/lib/apiAuth");
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });

  const { etatQuota, enregistrerUsage, MESSAGE_QUOTA_DEPASSE } = await import("@/lib/quotaIA");
  const quota = await etatQuota(user.id);
  if (quota.depasse) return NextResponse.json({ error: MESSAGE_QUOTA_DEPASSE }, { status: 402 });

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
    if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 413 });
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");

    let calque = "";
    if (isPdf) {
      try {
        calque = texteDuPdf(bytes).trim();
      } catch {
        calque = "";
      }
    }

    // Texte exploitable → on n'envoie QUE le texte (début + fin : les totaux
    // d'une facture sont en bas de la dernière page).
    let blocs: unknown[];
    if (calque.length > 200) {
      const extrait =
        calque.length <= TEXTE_MAX
          ? calque
          : calque.slice(0, TEXTE_MAX * 0.6) + "\n[…]\n" + calque.slice(-TEXTE_MAX * 0.4);
      blocs = [
        {
          type: "text",
          text:
            `NOM DU FICHIER : ${file.name}\n\n-----DÉBUT DU TEXTE DU DOCUMENT-----\n` +
            extrait +
            "\n-----FIN DU TEXTE DU DOCUMENT-----",
        },
      ];
    } else {
      const base64 = bytes.toString("base64");
      blocs = [
        isPdf
          ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 } }
          : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
        { type: "text", text: `NOM DU FICHIER : ${file.name}` },
      ];
    }

    const client = new Anthropic({ apiKey, maxRetries: 1 });
    const model = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
    const content = [...blocs, { type: "text", text: PROMPT }] as unknown as Anthropic.MessageParam["content"];

    const message = await avecDelai(
      client.messages.create({ model, max_tokens: 500, messages: [{ role: "user", content }] }),
      BUDGET_MS
    );
    await enregistrerUsage(user.id, message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);

    const part = message.content.find((c) => c.type === "text");
    const raw = part && "text" in part ? part.text : "";
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return NextResponse.json({ error: "Document non reconnu." }, { status: 422 });

    let brut: Record<string, unknown>;
    try {
      brut = JSON.parse(match[0]) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Document non reconnu." }, { status: 422 });
    }

    const type = (TYPES as readonly string[]).includes(String(brut.type)) ? String(brut.type) : "autre";
    const f = (type === "facture" && brut.facture && typeof brut.facture === "object"
      ? brut.facture
      : null) as Record<string, unknown> | null;

    return NextResponse.json({
      data: {
        type,
        facture: f
          ? {
              numero: texte(f.numero),
              date_document: date(f.date_document),
              date_echeance: date(f.date_echeance),
              total_ht: nombre(f.total_ht),
              total_tva: nombre(f.total_tva),
              total_ttc: nombre(f.total_ttc),
              tva: nombre(f.tva),
              immatriculation: texte(f.immatriculation),
              marque_modele: texte(f.marque_modele),
              client_nom: texte(f.client_nom),
              numero_sinistre: texte(f.numero_sinistre),
              assureur: texte(f.assureur),
            }
          : null,
      },
    });
  } catch (err: unknown) {
    if (err instanceof DelaiDepasse) {
      return NextResponse.json(
        { error: "Le tri automatique a pris trop de temps : choisis le type du document à la main." },
        { status: 504 }
      );
    }
    const anyErr = err as { status?: number; message?: string };
    const overloaded =
      anyErr?.status === 529 ||
      anyErr?.status === 429 ||
      (typeof anyErr?.message === "string" && anyErr.message.toLowerCase().includes("overloaded"));
    if (overloaded) {
      return NextResponse.json(
        { error: "Le service d'analyse IA est momentanément surchargé : choisis le type à la main." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : "Erreur de tri." }, { status: 500 });
  }
}
