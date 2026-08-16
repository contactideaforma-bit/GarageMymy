import { NextResponse } from "next/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { getAdminClient } from "@/lib/supabaseAdmin";
import { envoyerPush, pushConfigure } from "@/lib/pushServeur";
import { calculeProchaineAction } from "@/lib/actions";
import { estActif } from "@/lib/format";
import {
  Dossier,
  Document,
  Paiement,
  Relance,
  OrdreReparation,
  Restitution,
  CessionCreance,
  Evenement,
  LigneArdoise,
  ActionFaite,
} from "@/lib/types";

// ============================================================
//  RÉSUMÉ DU MATIN (cron quotidien, planifié dans vercel.json) — v42
//
//  Une notification par garage et par jour :
//    « 3 RDV aujourd'hui · 2 rappels · 1 dossier urgent »
//
//  Pourquoi UN résumé plutôt qu'une alerte par événement : l'offre Vercel
//  Hobby n'autorise qu'UNE exécution planifiée par jour. Le code est prêt
//  pour une cadence fine (il suffit d'appeler cette route plus souvent,
//  via Vercel Pro ou pg_cron côté Supabase) — voir `DEDUP_PAR_JOUR`.
// ============================================================

export const runtime = "nodejs";
export const maxDuration = 60;

/** Un seul résumé par jour et par garage (verrou en base). */
const DEDUP_PAR_JOUR = true;

/** Date du jour telle que le garage la vit, pas telle que le serveur la voit. */
function jourParis(d: Date = new Date()): string {
  return d.toLocaleDateString("fr-CA", { timeZone: "Europe/Paris" }); // AAAA-MM-JJ
}

function heureParis(iso: string): string {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function pluriel(n: number, singulier: string, plurielMot?: string): string {
  return `${n} ${n > 1 ? plurielMot || `${singulier}s` : singulier}`;
}

/** Véhicule / immatriculation / client, pour situer une ligne du résumé. */
function contexte(d?: Dossier): string {
  if (!d) return "";
  return [d.immatriculation, d.client_nom].filter(Boolean).join(" ");
}

type Prefs = { rdv: boolean; rappels: boolean; urgents: boolean; metier: string | null };

async function preferences(admin: SupabaseClient, ownerId: string): Promise<Prefs> {
  const { data } = await admin
    .from("entreprise")
    .select("push_rdv,push_rappels,push_urgents,metier")
    .eq("owner_id", ownerId)
    .maybeSingle();
  const e = (data || {}) as Record<string, unknown>;
  // Colonnes absentes (migration v42 pas encore passée) → tout activé.
  return {
    rdv: e.push_rdv !== false,
    rappels: e.push_rappels !== false,
    urgents: e.push_urgents !== false,
    metier: (e.metier as string) || null,
  };
}

/** Dossiers actifs dont la prochaine action est URGENTE et non cochée. */
async function dossiersUrgents(
  admin: SupabaseClient,
  ownerId: string,
  metier: string | null
): Promise<{ dossier: Dossier; titre: string }[]> {
  const { data: dossiersData } = await admin.from("dossiers").select("*").eq("owner_id", ownerId);
  const actifs = ((dossiersData as Dossier[]) || []).filter((d) => estActif(d.statut));
  if (actifs.length === 0) return [];
  const ids = actifs.map((d) => d.id);

  const [docs, pai, rel, ors, rests, cess, pcs, dem, faites] = await Promise.all([
    admin.from("documents").select("*").in("dossier_id", ids),
    admin.from("paiements").select("*").in("dossier_id", ids),
    admin.from("relances").select("*").in("dossier_id", ids),
    admin.from("ordres_reparation").select("*").in("dossier_id", ids),
    admin.from("restitutions").select("*").in("dossier_id", ids),
    admin.from("cessions_creance").select("*").in("dossier_id", ids),
    admin.from("pieces_dossier").select("dossier_id,type").in("dossier_id", ids),
    admin.from("demandes_assurance").select("dossier_id,demande,date_envoi").in("dossier_id", ids),
    admin.from("actions_faites").select("*").in("dossier_id", ids),
  ]);

  const documents = (docs.data as Document[]) || [];
  const paiements = (pai.data as Paiement[]) || [];
  const relances = (rel.data as Relance[]) || [];
  const ordres = (ors.data as OrdreReparation[]) || [];
  const restitutions = (rests.data as Restitution[]) || [];
  const cessions = (cess.data as CessionCreance[]) || [];
  const pieces = (pcs.data as { dossier_id: string; type: string }[]) || [];
  const demandes =
    (dem.data as { dossier_id: string; demande: string; date_envoi: string | null }[]) || [];
  const cochees = (faites.data as ActionFaite[]) || [];

  const resultat: { dossier: Dossier; titre: string }[] = [];
  for (const d of actifs) {
    const action = calculeProchaineAction({
      dossier: d,
      documents: documents.filter((x) => x.dossier_id === d.id),
      paiements: paiements.filter((x) => x.dossier_id === d.id),
      relances: relances.filter((x) => x.dossier_id === d.id),
      ordres: ordres.filter((x) => x.dossier_id === d.id),
      restitutions: restitutions.filter((x) => x.dossier_id === d.id),
      cessions: cessions.filter((x) => x.dossier_id === d.id),
      pieces: pieces.filter((x) => x.dossier_id === d.id),
      demandes: demandes.filter((x) => x.dossier_id === d.id),
      metier,
    });
    if (!action || action.urgence !== "haute") continue;
    // Déjà cochée sur le tableau de bord → ne pas notifier.
    if (cochees.some((c) => c.dossier_id === d.id && c.code === action.code)) continue;
    resultat.push({ dossier: d, titre: action.titre });
  }
  return resultat;
}

async function executer(req: Request) {
  // FAIL-CLOSED, comme /api/relances-auto : sans secret, cette route serait
  // un déclencheur d'envois ouvert sur internet.
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET non configuré : notifications désactivées (sécurité)." },
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

  // Garages qui ont au moins un appareil abonné.
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

  const jour = jourParis();
  // Fenêtre large autour d'aujourd'hui : on affine ensuite en heure de Paris,
  // pour ne pas se tromper de jour à cause du décalage UTC.
  const debut = new Date(Date.now() - 36 * 3600 * 1000).toISOString();
  const fin = new Date(Date.now() + 60 * 3600 * 1000).toISOString();

  let envoyes = 0;
  const details: string[] = [];

  for (const ownerId of owners) {
    const prefs = await preferences(admin, ownerId);

    /* --- 1. Rendez-vous du jour --- */
    let rdv: Evenement[] = [];
    if (prefs.rdv) {
      const { data } = await admin
        .from("evenements")
        .select("*")
        .eq("owner_id", ownerId)
        .gte("date_evenement", debut)
        .lte("date_evenement", fin)
        .order("date_evenement", { ascending: true });
      rdv = ((data as Evenement[]) || []).filter(
        (e) => jourParis(new Date(e.date_evenement)) === jour
      );
    }

    /* --- 2. Rappels écrits, échus ou dus aujourd'hui --- */
    let rappels: LigneArdoise[] = [];
    if (prefs.rappels) {
      const { data } = await admin
        .from("ardoise")
        .select("*")
        .eq("owner_id", ownerId)
        .eq("fait", false)
        .not("echeance", "is", null)
        .lte("echeance", fin)
        .order("echeance", { ascending: true });
      rappels = ((data as LigneArdoise[]) || []).filter(
        (r) => !!r.echeance && jourParis(new Date(r.echeance)) <= jour
      );
    }

    /* --- 3. Dossiers urgents --- */
    const urgents = prefs.urgents ? await dossiersUrgents(admin, ownerId, prefs.metier) : [];

    if (rdv.length === 0 && rappels.length === 0 && urgents.length === 0) {
      details.push(`${ownerId.slice(0, 8)} → rien à signaler`);
      continue;
    }

    /* --- Message --- */
    const resume: string[] = [];
    if (rdv.length) resume.push(pluriel(rdv.length, "RDV", "RDV"));
    if (rappels.length) resume.push(pluriel(rappels.length, "rappel"));
    if (urgents.length) resume.push(pluriel(urgents.length, "dossier urgent"));

    const lignes: string[] = [];
    for (const e of rdv.slice(0, 3)) {
      lignes.push(`${heureParis(e.date_evenement)} · ${e.titre}`);
    }
    for (const r of rappels.slice(0, 2)) {
      lignes.push(`⏰ ${r.texte.slice(0, 60)}`);
    }
    if (urgents.length) {
      const u = urgents[0];
      lignes.push(`🔴 ${u.titre}${contexte(u.dossier) ? ` — ${contexte(u.dossier)}` : ""}`);
    }

    const titre = `Aujourd'hui : ${resume.join(" · ")}`;
    const corps = lignes.join("\n") || "Ouvre le tableau de bord pour voir le détail.";

    /* --- Verrou d'idempotence : on écrit AVANT d'envoyer --- */
    if (DEDUP_PAR_JOUR) {
      const { error: eJournal } = await admin
        .from("push_journal")
        .insert({ jour, titre, corps, owner_id: ownerId });
      if (eJournal) {
        // 23505 = déjà notifié aujourd'hui (cron rejoué) → on saute.
        details.push(
          `${ownerId.slice(0, 8)} → sauté (${eJournal.code === "23505" ? "déjà notifié aujourd'hui" : "journal indisponible"})`
        );
        continue;
      }
    }

    const res = await envoyerPush(admin, ownerId, {
      titre,
      corps,
      url: "/",
      tag: "resume-du-jour",
    });
    envoyes += res.envoyes;
    if (DEDUP_PAR_JOUR) {
      await admin
        .from("push_journal")
        .update({ appareils: res.envoyes })
        .eq("owner_id", ownerId)
        .eq("jour", jour);
    }
    details.push(`${ownerId.slice(0, 8)} → ${res.envoyes} appareil(s) · ${titre}`);
  }

  return NextResponse.json({ ok: true, jour, garages: owners.length, envoyes, details });
}

export async function GET(req: Request) {
  return executer(req);
}
export async function POST(req: Request) {
  return executer(req);
}
