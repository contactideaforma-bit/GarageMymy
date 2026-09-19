import { NextRequest, NextResponse } from "next/server";
import type Anthropic from "@anthropic-ai/sdk";
import { avecDelai, DelaiDepasse } from "@/lib/delai";
import { texteDuPdf } from "@/lib/pdfTexte";
import { jsonDepuisTexte, nombre, preparerAppelIA, texte } from "@/lib/expertise/serveur";

/* ==================================================================
 *  LECTURE D'UN ORDRE DE MISSION (mode expert, v13.8)
 *  La fiche envoyée par l'assureur / le courtier / la plateforme de
 *  gestion — quelle que soit sa forme (PDF, email imprimé, photo, scan) —
 *  est lue et transformée en mission pré-remplie : mandant, sinistre,
 *  police, assuré, lésé, réparateur, véhicule, dommage, dates.
 * ================================================================== */

export const runtime = "nodejs";
export const maxDuration = 60;
const BUDGET_MS = 50_000;
const TEXTE_MAX = 30000;

const PROMPT = `Tu es l'assistant d'un cabinet d'expertise automobile. On te donne un ORDRE DE MISSION (ou une fiche de mission, un mail de mandatement, une prise en charge) envoyé par une compagnie d'assurance, un courtier, une plateforme de gestion de sinistres ou un cabinet donneur d'ordre. La forme varie d'un mandant à l'autre : lis tout ce qui est disponible.
Renvoie UNIQUEMENT cet objet JSON (aucun texte autour, pas de markdown), null pour toute information absente :

{"mandant":{"nom":string|null,"adresse":string|null,"email":string|null,"tel":string|null,"reference_mission":string|null,"gestionnaire":string|null},
"sinistre":{"numero":string|null,"date":string|null,"numero_police":string|null,"nature":string|null,"circonstances":string|null,"lieu":string|null},
"assure":{"nom":string|null},
"lese":{"nom":string|null,"adresse":string|null,"code_postal":string|null,"ville":string|null,"email":string|null,"tel":string|null},
"reparateur":{"nom":string|null,"adresse":string|null,"code_postal":string|null,"ville":string|null,"siret":string|null,"tel":string|null},
"vehicule":{"immatriculation":string|null,"marque":string|null,"modele":string|null,"finition":string|null,"vin":string|null,"energie":string|null,"date_mec":string|null,"couleur":string|null,"kilometrage":number|null,"genre":string|null},
"mission":{"date_mission":string|null,"date_visite":string|null,"type_expertise":string|null,"lieu_expertise":string|null,"garantie":string|null,"franchise":number|null,"instructions":string|null},
"dommage":{"type":string|null,"description":string|null,"zones":string|null},
"remarques":string|null}

Règles :
- "mandant.nom" = la compagnie / le courtier / le donneur d'ordre qui mandate l'expert (jamais le cabinet d'expertise destinataire). "reference_mission" = référence interne du mandant (n° de mission, n° de dossier gestionnaire). "gestionnaire" = nom du gestionnaire sinistre.
- "assure.nom" = l'assuré du contrat ; "lese" = propriétaire / conducteur du véhicule à expertiser (souvent la même personne : recopie alors le nom).
- "sinistre.nature" parmi : "Circulation", "Stationnement", "Vol / tentative de vol", "Vandalisme", "Incendie", "Grêle", "Bris de glace", "Catastrophe naturelle", "Autre".
- "mission.type_expertise" parmi : "Avant travaux", "En cours de travaux", "Après travaux", "Contradictoire", "Valeur vénale", "Contre-expertise". "lieu_expertise" parmi : "Chez le réparateur", "Au cabinet", "Chez l'assuré", "Expertise à distance (EAD)", "Autre lieu".
- "vehicule.energie" en clair (Essence, Diesel, Électrique, Essence Electricité (Rechargeable)…). Dates AAAA-MM-JJ. Immatriculation AA-123-AA en majuscules. Téléphones 0X XX XX XX XX.
- "dommage.description" : 1-3 phrases sur les dégâts déclarés (zones touchées, circonstances utiles). "mission.instructions" : consignes particulières du mandant (délais, EAD, photos, VEI, franchise, garantie…).
- N'invente rien.`;

export async function POST(req: NextRequest) {
  const prep = await preparerAppelIA(req);
  if (!prep.ok) return prep.reponse;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
    if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Fichier trop volumineux (max 15 Mo)." }, { status: 413 });
    const bytes = Buffer.from(await file.arrayBuffer());
    const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
    let calque = "";
    if (isPdf) { try { calque = texteDuPdf(bytes).trim(); } catch { calque = ""; } }
    const blocs: unknown[] = [];
    if (calque.length > 150) {
      blocs.push({ type: "text", text: `NOM DU FICHIER : ${file.name}\n-----DÉBUT DU DOCUMENT-----\n${calque.slice(0, TEXTE_MAX)}\n-----FIN DU DOCUMENT-----` });
    } else {
      const b64 = bytes.toString("base64");
      blocs.push(isPdf
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: b64 } }
        : { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: b64 } });
      blocs.push({ type: "text", text: `NOM DU FICHIER : ${file.name}` });
    }
    blocs.push({ type: "text", text: PROMPT });
    const message = await avecDelai(
      prep.client.messages.create({ model: prep.model, max_tokens: 2500, messages: [{ role: "user", content: blocs as unknown as Anthropic.MessageParam["content"] }] }),
      BUDGET_MS
    );
    await prep.enregistrer(message.usage?.input_tokens || 0, message.usage?.output_tokens || 0);
    const part = message.content.find((c) => c.type === "text");
    const brut = jsonDepuisTexte(part && "text" in part ? part.text : "") as Record<string, Record<string, unknown> | string | null> | null;
    if (!brut) return NextResponse.json({ error: "Document illisible : réessaie avec un fichier plus net." }, { status: 422 });
    const o = (k: string) => (brut[k] && typeof brut[k] === "object" ? (brut[k] as Record<string, unknown>) : {});
    const t = (obj: Record<string, unknown>, k: string, max = 200) => texte(obj[k], max);
    const date = (obj: Record<string, unknown>, k: string) => { const v = t(obj, k, 12); return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null; };
    const m = o("mandant"), s = o("sinistre"), a = o("assure"), l = o("lese"), r = o("reparateur"), v = o("vehicule"), mi = o("mission"), d = o("dommage");
    return NextResponse.json({
      data: {
        mandant: { nom: t(m, "nom"), adresse: t(m, "adresse", 300), email: t(m, "email"), tel: t(m, "tel", 30), reference_mission: t(m, "reference_mission", 60), gestionnaire: t(m, "gestionnaire") },
        sinistre: { numero: t(s, "numero", 60), date: date(s, "date"), numero_police: t(s, "numero_police", 60), nature: t(s, "nature", 40), circonstances: t(s, "circonstances", 600), lieu: t(s, "lieu") },
        assure: { nom: t(a, "nom") },
        lese: { nom: t(l, "nom"), adresse: t(l, "adresse", 300), code_postal: (t(l, "code_postal", 10) || "").replace(/\D/g, "") || null, ville: t(l, "ville"), email: t(l, "email"), tel: t(l, "tel", 30) },
        reparateur: { nom: t(r, "nom"), adresse: t(r, "adresse", 300), code_postal: (t(r, "code_postal", 10) || "").replace(/\D/g, "") || null, ville: t(r, "ville"), siret: (t(r, "siret", 20) || "").replace(/\D/g, "") || null, tel: t(r, "tel", 30) },
        vehicule: { immatriculation: (t(v, "immatriculation", 12) || "").toUpperCase() || null, marque: t(v, "marque", 40), modele: t(v, "modele", 60), finition: t(v, "finition", 80), vin: (t(v, "vin", 20) || "").toUpperCase() || null, energie: t(v, "energie", 60), date_mec: date(v, "date_mec"), couleur: t(v, "couleur", 40), kilometrage: nombre(v.kilometrage), genre: t(v, "genre", 80) },
        mission: { date_mission: date(mi, "date_mission"), date_visite: date(mi, "date_visite"), type_expertise: t(mi, "type_expertise", 40), lieu_expertise: t(mi, "lieu_expertise", 40), garantie: t(mi, "garantie", 100), franchise: nombre(mi.franchise), instructions: t(mi, "instructions", 800) },
        dommage: { type: t(d, "type", 40), description: t(d, "description", 800), zones: t(d, "zones", 200) },
        remarques: texte(brut.remarques, 500),
      },
    });
  } catch (e) {
    if (e instanceof DelaiDepasse) return NextResponse.json({ error: "La lecture a dépassé le temps autorisé : envoie seulement les pages utiles." }, { status: 504 });
    return NextResponse.json({ error: e instanceof Error ? e.message : "Erreur inattendue." }, { status: 500 });
  }
}
