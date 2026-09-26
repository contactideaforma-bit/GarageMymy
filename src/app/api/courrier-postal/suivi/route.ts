import { NextResponse } from "next/server";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { utilisateurDepuisRequete, REPONSE_401 } from "@/lib/apiAuth";
import { identifiantsMaileva, suiviCourrier } from "@/lib/maileva";
import { EnvoiPostal, statutDepuisMaileva, STATUT_ENVOI } from "@/lib/envoisPostaux";

export const runtime = "nodejs";
export const maxDuration = 60;

// Réinterroge Maileva pour les envois encore en cours du garage connecté
// (ou ceux demandés), met à jour statut, n° de recommandé et historique.
// Le n° de recommandé est aussi reporté sur le courrier de recouvrement
// d'origine (preuve de la procédure d'impayé).

export async function POST(req: Request) {
  const user = await utilisateurDepuisRequete(req);
  if (!user) return NextResponse.json(REPONSE_401, { status: 401 });
  const admin = getAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante côté serveur." }, { status: 500 });

  let body: { ids?: string[] } = {};
  try { body = await req.json(); } catch { /* corps vide accepté */ }

  let q = admin
    .from("envois_postaux")
    .select("*")
    .eq("owner_id", user.id)
    .not("maileva_sending_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(30);
  q = body.ids?.length ? q.in("id", body.ids.slice(0, 30)) : q.in("statut", ["soumis", "en_production", "poste"]);
  const { data: envois, error } = await q;
  if (error) return NextResponse.json({ error: "Journal des envois indisponible (migration v89 ?)." }, { status: 500 });
  if (!envois?.length) return NextResponse.json({ ok: true, envois: [] });

  const id = await identifiantsMaileva(user.id);
  if (!id) return NextResponse.json({ error: "Maileva n'est pas configuré." }, { status: 400 });

  const resultats: EnvoiPostal[] = [];
  const erreurs: string[] = [];
  for (const e of envois as EnvoiPostal[]) {
    try {
      const s = await suiviCourrier(id, e.type, e.maileva_sending_id!, e.maileva_recipient_id);
      const statut = statutDepuisMaileva({ statutEnvoi: s.statutEnvoi, statutDestinataire: s.statutDestinataire, evenements: s.evenements, actuel: e.statut });
      const historique = [...(e.historique || [])];
      if (statut !== e.statut) historique.push({ date: new Date().toISOString(), statut, detail: STATUT_ENVOI[statut].aide });
      for (const ev of s.evenements) {
        if (!historique.some((h) => h.statut === ev.statut && h.date === ev.date)) historique.push(ev);
      }
      const patch = {
        statut,
        statut_maileva: [s.statutEnvoi, s.statutDestinataire].filter(Boolean).join(" / ") || e.statut_maileva,
        numero_suivi: s.numeroSuivi || e.numero_suivi,
        historique,
        maj_statut_le: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      // Rejet par Maileva / La Poste : le courrier n'est pas parti, les jetons sont rendus (une seule fois).
      const aRembourser = (statut === "rejete" || statut === "erreur") && !(e as EnvoiPostal & { rembourse?: boolean }).rembourse && ((e as EnvoiPostal & { jetons?: number }).jetons || 0) > 0;
      if (aRembourser) {
        await admin.rpc("jetons_crediter", {
          p_owner: user.id, p_n: (e as EnvoiPostal & { jetons?: number }).jetons, p_motif: "remboursement",
          p_libelle: `Courrier rejeté par La Poste → ${e.destinataire_nom || ""}`.slice(0, 200), p_envoi: e.id, p_achat: null, p_auteur: "systeme",
        });
        historique.push({ date: new Date().toISOString(), statut, detail: "Jetons rendus" });
      }
      const { data: maj } = await admin.from("envois_postaux").update(aRembourser ? { ...patch, historique, rembourse: true } : patch).eq("id", e.id).select("*").single();
      resultats.push((maj as EnvoiPostal) || { ...e, ...patch });

      if (s.numeroSuivi && !e.numero_suivi && e.courrier_id) {
        await admin
          .from("courriers_recouvrement")
          .update({ numero_suivi: s.numeroSuivi })
          .eq("id", e.courrier_id)
          .is("numero_suivi", null);
      }
    } catch (err) {
      erreurs.push(`${e.destinataire_nom || e.id} : ${(err as Error).message}`);
    }
  }
  return NextResponse.json({ ok: true, envois: resultats, erreurs });
}
