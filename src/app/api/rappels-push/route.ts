import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerPush, pushConfigure } from "@/lib/pushServeur";
import { Evenement, LigneArdoise } from "@/lib/types";

// ====================================================================
//  RAPPEL À L'HEURE DU RENDEZ-VOUS (v11.5)
//
//  `/api/notifications-push` envoie UN RÉSUMÉ LE MATIN. Un rappel posé à
//  14 h ne déclenchait donc rien à 14 h — c'est le retour de l'utilisateur.
//  Cette route est faite pour tourner SOUVENT (toutes les 15 minutes) et
//  n'envoyer que ce qui arrive à échéance.
//
//  Sources : les rendez-vous de l'agenda (`evenements`) et les rappels
//  datés du bloc « À faire » (`ardoise.echeance`, non cochés).
//
//  Idempotence : table `push_rappels`, clé UNIQUE par créneau
//  (« rdv:<id> » / « tache:<id> »). On INSÈRE AVANT D'ENVOYER : si la
//  ligne existe déjà, on ne renvoie rien. Un rejeu du cron est sans effet.
//
//  Rattrapage : si un passage est manqué (déploiement, panne), un créneau
//  de moins de 2 h est quand même notifié — mais jamais celui d'hier.
//
//  Planification : voir la fin de supabase/migration_v63.sql (Vercel Pro
//  ou pg_cron côté Supabase).
// ====================================================================

export const runtime = "nodejs";
export const maxDuration = 60;

/** On ne notifie jamais un créneau plus vieux que ça (minutes). */
const RATTRAPAGE_MIN = 120;
/** Garde-fou : au plus N notifications par garage et par passage. */
const MAX_PAR_PASSAGE = 5;
const AVANCE_DEFAUT = 15;

type Prefs = { heure: boolean; avance: number };

async function preferences(admin: SupabaseClient, ownerId: string): Promise<Prefs> {
  const { data } = await admin
    .from("entreprise")
    .select("push_heure,push_avance_min")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const e = (data || {}) as { push_heure?: boolean; push_avance_min?: number };
  const avance = Number(e.push_avance_min);
  return {
    heure: e.push_heure !== false,
    avance: Number.isFinite(avance) && avance >= 0 && avance <= 240 ? avance : AVANCE_DEFAUT,
  };
}

function heureParis(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Paris",
  });
}

/** « maintenant », « dans 15 min », « il y a 10 min ». */
function quand(momentMs: number, maintenantMs: number): string {
  const min = Math.round((momentMs - maintenantMs) / 60000);
  if (min <= 1 && min >= -1) return "maintenant";
  if (min > 1) return `dans ${min} min`;
  return `il y a ${Math.abs(min)} min`;
}

type ARappeler = { cle: string; titre: string; corps: string; url: string };

async function executer(req: Request) {
  // FAIL-CLOSED, comme /api/notifications-push et /api/relances-auto.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré : rappels désactivés (sécurité)." },
      { status: 503 }
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé." }, { status: 401 });
  }
  if (!pushConfigure()) {
    return NextResponse.json(
      { error: "Clés VAPID absentes (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)." },
      { status: 503 }
    );
  }

  const admin = getAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante." }, { status: 500 });
  }

  const { data: abos, error: eAbos } = await admin
    .from("push_abonnements")
    .select("owner_id")
    .eq("actif", true);
  if (eAbos) {
    return NextResponse.json(
      { error: "Lecture des abonnements impossible (migration v42 exécutée ?)." },
      { status: 500 }
    );
  }
  const owners = Array.from(new Set(((abos as { owner_id: string }[]) || []).map((a) => a.owner_id)));
  if (owners.length === 0) return NextResponse.json({ ok: true, garages: 0, envoyes: 0 });

  const maintenant = Date.now();
  const planchier = new Date(maintenant - RATTRAPAGE_MIN * 60000).toISOString();

  let envoyes = 0;
  const details: string[] = [];

  for (const ownerId of owners) {
    const prefs = await preferences(admin, ownerId);
    if (!prefs.heure) continue;

    // Créneau notifiable : entre « il y a RATTRAPAGE » et « dans AVANCE ».
    const plafond = new Date(maintenant + prefs.avance * 60000).toISOString();
    const aRappeler: ARappeler[] = [];

    /* --- 1. Rendez-vous de l'agenda --- */
    const { data: rdvData } = await admin
      .from("evenements")
      .select("*")
      .eq("owner_id", ownerId)
      .gte("date_evenement", planchier)
      .lte("date_evenement", plafond)
      .order("date_evenement", { ascending: true });
    for (const e of (rdvData as Evenement[]) || []) {
      const t = new Date(e.date_evenement).getTime();
      aRappeler.push({
        cle: `rdv:${e.id}`,
        titre: `📅 Rendez-vous ${quand(t, maintenant)}`,
        corps: [heureParis(e.date_evenement), e.titre, e.avec_qui ? `avec ${e.avec_qui}` : ""]
          .filter(Boolean)
          .join(" · "),
        url: e.dossier_id ? `/sinistres/${e.dossier_id}` : "/agenda",
      });
    }

    /* --- 2. Rappels datés du bloc « À faire », non cochés --- */
    const { data: tacheData } = await admin
      .from("ardoise")
      .select("*")
      .eq("owner_id", ownerId)
      .eq("fait", false)
      .not("echeance", "is", null)
      .gte("echeance", planchier)
      .lte("echeance", plafond)
      .order("echeance", { ascending: true });
    for (const r of (tacheData as LigneArdoise[]) || []) {
      if (!r.echeance) continue;
      const t = new Date(r.echeance).getTime();
      aRappeler.push({
        cle: `tache:${r.id}`,
        titre: `⏰ Rappel ${quand(t, maintenant)}`,
        corps: [heureParis(r.echeance), r.texte.slice(0, 90)].filter(Boolean).join(" · "),
        url: r.dossier_id ? `/sinistres/${r.dossier_id}` : "/",
      });
    }

    if (aRappeler.length === 0) continue;

    for (const item of aRappeler.slice(0, MAX_PAR_PASSAGE)) {
      // INSERTION AVANT ENVOI : l'index unique sur `cle` fait le verrou.
      // Une violation de contrainte = déjà notifié, on passe au suivant.
      const { error: eJournal } = await admin
        .from("push_rappels")
        .insert({ owner_id: ownerId, cle: item.cle, titre: item.titre });
      if (eJournal) continue;

      const res = await envoyerPush(admin, ownerId, {
        titre: item.titre,
        corps: item.corps,
        url: item.url,
        // Un tag propre à chaque créneau : deux rappels ne s'écrasent pas.
        tag: item.cle,
      });
      envoyes += res.envoyes;
      await admin.from("push_rappels").update({ appareils: res.envoyes }).eq("cle", item.cle);
      details.push(`${ownerId.slice(0, 8)} → ${item.cle} (${res.envoyes} appareil(s))`);
    }
  }

  return NextResponse.json({ ok: true, garages: owners.length, envoyes, details });
}

export async function GET(req: Request) {
  return executer(req);
}
export async function POST(req: Request) {
  return executer(req);
}
