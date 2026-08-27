// ============================================================
//  ÉTAT DES COMPTES — côté SERVEUR (service role), v10.1.
//  Partagé par /api/admin/donnees (actions de l'éditeur) et le cron
//  quotidien /api/cron-comptes (fins de contrat, purge à J+90).
// ============================================================

import { SupabaseClient } from "@supabase/supabase-js";

export const JOURS_AVANT_PURGE = 90;
export const JOURS_PREAVIS_PURGE = 7;
const BUCKETS = ["rapports", "pieces", "prive", "photos", "entreprise"];

export type EtatCompteRow = {
  owner_id: string;
  etat: "actif" | "suspendu" | "lecture_seule" | "ferme";
  motif?: string | null;
  message?: string | null;
  fin_le?: string | null;
  purge_le?: string | null;
  prevenu_le?: string | null;
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);
export function plusJours(iso: string, n: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return ymd(d);
}

export async function definirEtat(admin: SupabaseClient, row: EtatCompteRow): Promise<void> {
  const { error } = await admin
    .from("comptes_etat")
    .upsert({ ...row, depuis: new Date().toISOString(), maj_le: new Date().toISOString() }, { onConflict: "owner_id" });
  if (error) throw new Error(error.message);
}

/**
 * FINS DE CONTRAT : tout abonnement résilié dont la date de fin est passée
 * et qui a un compte rattaché passe en LECTURE SEULE, purge programmée à
 * J+90. Un compte déjà en lecture seule / fermé n'est pas touché ; un
 * abonnement redevenu actif lève la lecture seule.
 */
export async function appliquerFinsDeContrat(admin: SupabaseClient): Promise<{ lectureSeule: number; reactives: number }> {
  const auj = ymd(new Date());
  const { data: abos } = await admin.from("abonnements").select("id,garage_nom,garage_email,garage_owner_id,statut,date_fin");
  const { data: etats } = await admin.from("comptes_etat").select("*");
  const parOwner = new Map(((etats || []) as EtatCompteRow[]).map((e) => [e.owner_id, e]));
  // Rattachement par email si garage_owner_id absent.
  const { data: users } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const parEmail = new Map((users?.users || []).map((u) => [(u.email || "").toLowerCase(), u.id]));

  let lectureSeule = 0;
  let reactives = 0;
  for (const a of abos || []) {
    const owner: string | null = a.garage_owner_id || (a.garage_email ? parEmail.get(String(a.garage_email).toLowerCase()) || null : null);
    if (!owner) continue;
    const e = parOwner.get(owner);
    if (a.statut === "resilie" && a.date_fin && a.date_fin <= auj) {
      if (!e || e.etat === "actif") {
        await definirEtat(admin, {
          owner_id: owner,
          etat: "lecture_seule",
          motif: "fin_de_contrat",
          message: null,
          fin_le: a.date_fin,
          purge_le: plusJours(a.date_fin, JOURS_AVANT_PURGE),
        });
        lectureSeule += 1;
      }
    } else if (a.statut === "actif" && e && e.etat === "lecture_seule" && e.motif === "fin_de_contrat") {
      await definirEtat(admin, { owner_id: owner, etat: "actif", motif: null, message: null, fin_le: null, purge_le: null });
      reactives += 1;
    }
  }
  return { lectureSeule, reactives };
}

/** Supprime tous les fichiers d'un compte dans un bucket (préfixe owner_id/). */
async function viderBucket(admin: SupabaseClient, bucket: string, ownerId: string): Promise<number> {
  let total = 0;
  const parcourir = async (prefixe: string) => {
    const { data, error } = await admin.storage.from(bucket).list(prefixe, { limit: 1000 });
    if (error || !data) return;
    const fichiers = data.filter((o) => o.id).map((o) => `${prefixe}/${o.name}`);
    const dossiers = data.filter((o) => !o.id).map((o) => `${prefixe}/${o.name}`);
    if (fichiers.length) {
      const { error: e } = await admin.storage.from(bucket).remove(fichiers);
      if (!e) total += fichiers.length;
    }
    for (const d of dossiers) await parcourir(d);
  };
  await parcourir(ownerId);
  return total;
}

/**
 * PURGE d'un compte : fichiers de tous les buckets, puis suppression de
 * l'utilisateur Auth (les tables rattachées par owner_id sont en
 * `on delete cascade`). Trace conservée dans comptes_purges.
 */
export async function purgerCompte(admin: SupabaseClient, ownerId: string, notes?: string): Promise<{ objets: number }> {
  const { data: u } = await admin.auth.admin.getUserById(ownerId);
  const email = u?.user?.email || null;
  const { data: ent } = await admin.from("entreprise").select("nom").eq("owner_id", ownerId).maybeSingle();
  let objets = 0;
  for (const b of BUCKETS) {
    try {
      objets += await viderBucket(admin, b, ownerId);
    } catch {
      /* bucket absent */
    }
  }
  await admin.from("comptes_purges").insert({ owner_id: ownerId, email, garage_nom: ent?.nom || null, objets, notes: notes || null });
  const { error } = await admin.auth.admin.deleteUser(ownerId);
  if (error) throw new Error(`Suppression du compte impossible : ${error.message}`);
  return { objets };
}

/** Comptes dont la purge est due (purge_le ≤ aujourd'hui, lecture seule ou fermé). */
export async function comptesAPurger(admin: SupabaseClient): Promise<EtatCompteRow[]> {
  const auj = ymd(new Date());
  const { data } = await admin.from("comptes_etat").select("*").in("etat", ["lecture_seule", "ferme"]).lte("purge_le", auj);
  return (data || []) as EtatCompteRow[];
}

/** Comptes à prévenir (purge dans ≤ 7 jours, pas encore prévenus). */
export async function comptesAPrevenir(admin: SupabaseClient): Promise<EtatCompteRow[]> {
  const limite = plusJours(new Date().toISOString(), JOURS_PREAVIS_PURGE);
  const { data } = await admin
    .from("comptes_etat")
    .select("*")
    .in("etat", ["lecture_seule", "ferme"])
    .lte("purge_le", limite)
    .is("prevenu_le", null);
  return (data || []) as EtatCompteRow[];
}
