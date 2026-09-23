import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { ipDe, tropDeDemandes } from "@/lib/limiteur";
import type { Controle, EcartControle, ReponseGarage } from "@/lib/expertise/controle";
import { appliquerControle, journaliser, motsControle, totalHT } from "@/lib/expertise/controle";

// ============================================================
//  PORTAIL DE RÉPONSE DU GARAGE — route PUBLIQUE (v13.25)
//
//  UN lien par demande de l'expert (jeton du contrôle) : le garage y
//  répond à TOUS les points en une seule fois (accord / contestation,
//  commentaire, photos). On ne renvoie que ce qui concerne sa demande :
//  jamais l'assureur, le lésé, les coordonnées d'autres garages ni
//  d'identifiant interne réutilisable.
// ============================================================

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
const SANS_CACHE = { "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", Pragma: "no-cache" };
const BUCKET = "pieces";
const MAX_FICHIERS_LIGNE = 5;
const MAX_OCTETS = 4 * 1024 * 1024;

type Ctx = { params: Promise<{ token: string }> | { token: string } };

async function charger(token: string) {
  const admin = getAdminClient();
  if (!admin) return { erreur: NextResponse.json({ error: "Service indisponible." }, { status: 503, headers: SANS_CACHE }) };
  if (!token || token.length < 20) return { erreur: NextResponse.json({ error: "Lien invalide." }, { status: 404, headers: SANS_CACHE }) };
  const { data } = await admin.from("expertise_controles").select("*").eq("lien_token", token).maybeSingle();
  if (!data) return { erreur: NextResponse.json({ error: "Ce lien n'est plus valable." }, { status: 404, headers: SANS_CACHE }) };
  const c = data as Controle;
  if (c.lien_expire_le && new Date(c.lien_expire_le).getTime() < Date.now()) {
    return { erreur: NextResponse.json({ error: "Ce lien a expiré : contactez le cabinet d'expertise." }, { status: 410, headers: SANS_CACHE }) };
  }
  return { admin, c };
}

const publicEcart = (e: EcartControle) => ({ id: e.id, libelle: e.libelle, precision: e.precision ?? null, avant: e.avant, apres: e.apres, motif: e.motif ?? null, decision: e.decision, montant_avant: e.montant_avant, montant_apres: e.montant_apres });

export async function GET(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (tropDeDemandes("reponse-garage-get", ipDe(req), 120)) return NextResponse.json({ error: "Trop de demandes, réessayez plus tard." }, { status: 429 });
  const r = await charger(token);
  if (r.erreur) return r.erreur;
  const { admin, c } = r;

  const [{ data: d }, { data: cab }] = await Promise.all([
    admin.from("expertise_dossiers").select("numero,immatriculation,marque,modele,reparateur_nom").eq("id", c.dossier_id).maybeSingle(),
    admin.from("expertise_cabinet").select("nom,tel,email,expert_nom").eq("owner_id", c.owner_id).maybeSingle(),
  ]);
  const m = motsControle(c.type);
  const reponse = c.reponse_garage && !c.reponse_garage.traitee_le ? c.reponse_garage : null;
  return NextResponse.json(
    {
      type: c.type || "devis",
      titre: m.titrePdf,
      document: c.devis?.nom ?? null,
      dossier: d ? { numero: d.numero, immatriculation: d.immatriculation, vehicule: [d.marque, d.modele].filter(Boolean).join(" ") || null, reparateur: d.reparateur_nom } : null,
      cabinet: cab ? { nom: cab.nom, tel: cab.tel, email: cab.email, expert: cab.expert_nom } : null,
      ouvert: c.statut === "attente_garage" && !reponse,
      statut: c.statut,
      commentaire: c.commentaire,
      demande_le: c.cloture_le,
      total_attendu: c.reference ? totalHT(appliquerControle(c.reference, c.ecarts || [])) : null,
      refuses: (c.ecarts || []).filter((e) => e.decision === "refuse").map(publicEcart),
      acceptes: (c.ecarts || []).filter((e) => e.decision === "accepte").map(publicEcart),
      reponse: reponse ? { recu_le: reponse.recu_le, contact: reponse.contact, commentaire: reponse.commentaire, lignes: reponse.lignes.map((l) => ({ ecart_id: l.ecart_id, accord: l.accord, commentaire: l.commentaire, nb_photos: l.photos.length })) } : null,
    },
    { headers: SANS_CACHE }
  );
}

export async function POST(req: Request, ctx: Ctx) {
  const { token } = await ctx.params;
  if (tropDeDemandes("reponse-garage-post", ipDe(req), 20)) return NextResponse.json({ error: "Trop d'envois, réessayez plus tard." }, { status: 429 });
  const r = await charger(token);
  if (r.erreur) return r.erreur;
  const { admin, c } = r;

  if (c.statut !== "attente_garage") return NextResponse.json({ error: "Cette demande a déjà été traitée par l'expert." }, { status: 409 });
  if (c.reponse_garage && !c.reponse_garage.traitee_le) return NextResponse.json({ error: "Une réponse a déjà été envoyée pour cette demande." }, { status: 409 });

  let form: FormData;
  try { form = await req.formData(); } catch { return NextResponse.json({ error: "Envoi illisible (fichiers trop lourds ?)." }, { status: 400 }); }
  let brut: { contact?: unknown; commentaire?: unknown; lignes?: unknown };
  try { brut = JSON.parse(String(form.get("reponse") || "{}")); } catch { return NextResponse.json({ error: "Réponse illisible." }, { status: 400 }); }

  const refuses = (c.ecarts || []).filter((e) => e.decision === "refuse");
  const lignesBrutes = Array.isArray(brut.lignes) ? (brut.lignes as Record<string, unknown>[]) : [];
  const txt = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

  // Garde-fous : chaque point refusé reçoit UNE réponse ; une contestation est motivée.
  const lignes: ReponseGarage["lignes"] = [];
  for (const e of refuses) {
    const l = lignesBrutes.find((x) => x.ecart_id === e.id);
    if (!l || typeof l.accord !== "boolean") return NextResponse.json({ error: `Réponse manquante pour « ${e.libelle} ».` }, { status: 400 });
    const commentaire = txt(l.commentaire, 1500);
    if (!l.accord && !commentaire) return NextResponse.json({ error: `Expliquez votre contestation pour « ${e.libelle} ».` }, { status: 400 });
    lignes.push({ ecart_id: e.id, accord: l.accord, commentaire, photos: [] });
  }

  // Pièces jointes (photos / PDF), rangées dans le dossier privé de l'expert.
  let total = 0;
  for (const l of lignes) {
    const fichiers = form.getAll(`fichiers_${l.ecart_id}`).filter((f): f is File => f instanceof File && f.size > 0).slice(0, MAX_FICHIERS_LIGNE);
    for (let i = 0; i < fichiers.length; i += 1) {
      const f = fichiers[i];
      total += f.size;
      if (total > MAX_OCTETS) return NextResponse.json({ error: "Pièces jointes trop lourdes (4 Mo au total)." }, { status: 413 });
      const type = f.type || "application/octet-stream";
      if (!/^image\/(jpeg|png|webp|heic|heif)$|^application\/pdf$/.test(type)) return NextResponse.json({ error: "Seules les photos et les PDF sont acceptés." }, { status: 415 });
      const ext = type === "application/pdf" ? "pdf" : type.split("/")[1].replace("jpeg", "jpg");
      const chemin = `${c.owner_id}/expertise/${c.dossier_id}/reponses/${c.id}/${l.ecart_id}-${Date.now()}-${i}.${ext}`;
      const { error } = await admin.storage.from(BUCKET).upload(chemin, Buffer.from(await f.arrayBuffer()), { contentType: type, upsert: false });
      if (error) return NextResponse.json({ error: "Enregistrement d'une pièce jointe impossible, réessayez." }, { status: 500 });
      l.photos.push(chemin);
    }
  }

  const reponse: ReponseGarage = { recu_le: new Date().toISOString(), contact: txt(brut.contact, 120), commentaire: txt(brut.commentaire, 3000), lignes, traitee_le: null };
  const nbAccords = lignes.filter((l) => l.accord).length;
  const { error } = await admin
    .from("expertise_controles")
    .update({
      reponse_garage: reponse,
      journal: journaliser(c.journal, "Réponse du garage reçue", `${nbAccords} accord(s), ${lignes.length - nbAccords} contestation(s)${reponse.contact ? ` — ${reponse.contact}` : ""}`),
      updated_at: new Date().toISOString(),
    })
    .eq("id", c.id)
    .eq("statut", "attente_garage");
  if (error) return NextResponse.json({ error: "Enregistrement impossible, réessayez." }, { status: 500 });
  return NextResponse.json({ ok: true, accords: nbAccords, contestations: lignes.length - nbAccords }, { headers: SANS_CACHE });
}
