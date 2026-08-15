"use client";

// MÉMOIRE DE L'ANALYSE — accès base côté NAVIGATEUR (v7.7).
// La logique pure (diff, application des règles, prompt) vit dans
// lib/apprentissage.ts ; ici on ne fait que lire/écrire.

import { supabase } from "./supabaseClient";
import { IaRegle, TypeRegle } from "./types";
import { CorrectionDetectee, SEUIL_APPRENTISSAGE } from "./apprentissage";

/** Règles du garage (toutes, actives ou non) pour la page « Mémoire ». */
export async function chargerRegles(): Promise<IaRegle[]> {
  const { data, error } = await supabase
    .from("ia_regles")
    .select("*")
    .order("actif", { ascending: false })
    .order("occurrences", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []) as IaRegle[];
}

export async function basculerRegle(id: string, actif: boolean): Promise<void> {
  const { error } = await supabase
    .from("ia_regles")
    .update({ actif, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function supprimerRegle(id: string): Promise<void> {
  const { error } = await supabase.from("ia_regles").delete().eq("id", id);
  if (error) throw error;
}

/** Ajout / modification d'une règle écrite à la main dans le profil. */
export async function enregistrerRegleManuelle(r: {
  id?: string;
  type: TypeRegle;
  cle: string;
  valeur: string;
}): Promise<void> {
  const payload = {
    type: r.type,
    cle: r.cle,
    valeur: r.valeur,
    source: "manuel",
    actif: true,
    updated_at: new Date().toISOString(),
  };
  if (r.id) {
    const { error } = await supabase.from("ia_regles").update(payload).eq("id", r.id);
    if (error) throw error;
    return;
  }
  // Pas d'upsert : la contrainte d'unicité porte sur owner_id (valeur par
  // défaut côté base), que le client ne connaît pas. On cherche puis on écrit.
  const { data: existante } = await supabase
    .from("ia_regles")
    .select("id")
    .eq("type", r.type)
    .eq("cle", r.cle)
    .maybeSingle();
  if (existante?.id) {
    const { error } = await supabase.from("ia_regles").update(payload).eq("id", existante.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("ia_regles").insert({ ...payload, occurrences: 1 });
    if (error) throw error;
  }
}

/**
 * APPRENTISSAGE : journalise les corrections faites sur un document, puis
 * promeut en RÈGLE celles qui reviennent au moins SEUIL_APPRENTISSAGE fois.
 *
 * Ne lève jamais : c'est un enrichissement, pas une opération critique — un
 * échec ici ne doit pas empêcher l'enregistrement de la facture.
 * Renvoie le nombre de règles nouvellement retenues.
 */
export async function apprendreDesCorrections(
  dossierId: string | null,
  documentId: string | null,
  corrections: CorrectionDetectee[]
): Promise<number> {
  if (corrections.length === 0) return 0;
  try {
    const { error } = await supabase.from("ia_corrections").insert(
      corrections.map((c) => ({
        dossier_id: dossierId,
        document_id: documentId,
        type: c.type,
        cle: c.cle,
        valeur: c.valeur,
        exemple: c.exemple,
      }))
    );
    if (error) throw error;

    let retenues = 0;
    for (const c of corrections) {
      const { count, error: eCount } = await supabase
        .from("ia_corrections")
        .select("id", { count: "exact", head: true })
        .eq("type", c.type)
        .eq("cle", c.cle)
        .eq("valeur", c.valeur);
      if (eCount) continue;
      const occurrences = count || 0;
      if (occurrences < SEUIL_APPRENTISSAGE) continue;

      const { data: existante } = await supabase
        .from("ia_regles")
        .select("id,valeur")
        .eq("type", c.type)
        .eq("cle", c.cle)
        .maybeSingle();

      if (existante?.id) {
        // On ne touche PAS à `actif` : une règle désactivée à la main le reste.
        await supabase
          .from("ia_regles")
          .update({
            valeur: c.valeur,
            occurrences,
            exemple: c.exemple,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existante.id);
        if (existante.valeur !== c.valeur) retenues++;
      } else {
        await supabase.from("ia_regles").insert({
          type: c.type,
          cle: c.cle,
          valeur: c.valeur,
          source: "auto",
          occurrences,
          actif: true,
          exemple: c.exemple,
        });
        retenues++;
      }
    }
    return retenues;
  } catch {
    // Migration v40 pas encore passée, hors ligne… : on n'apprend pas, c'est tout.
    return 0;
  }
}

/** Corrections observées mais pas encore retenues (affichage « en attente »). */
export async function compterCorrectionsEnAttente(): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("ia_corrections")
      .select("type,cle,valeur")
      .limit(2000);
    if (error || !data) return 0;
    const compte = new Map<string, number>();
    for (const c of data as { type: string; cle: string; valeur: string }[]) {
      const k = `${c.type}|${c.cle}|${c.valeur}`;
      compte.set(k, (compte.get(k) || 0) + 1);
    }
    let n = 0;
    compte.forEach((v) => {
      if (v < SEUIL_APPRENTISSAGE) n++;
    });
    return n;
  } catch {
    return 0;
  }
}
