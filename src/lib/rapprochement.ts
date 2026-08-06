// RAPPROCHEMENT BANCAIRE — encaissement d'une transaction sur une facture.
// Logique PARTAGÉE entre le rapprochement manuel (modale) et l'analyse
// automatique du relevé (v6.7), pour qu'ils se comportent exactement pareil.

import { supabase } from "./supabaseClient";
import { BankTransaction } from "./types";
import { FactureBanque } from "./banque";
import { estSoldee } from "./paiements";
import { majDossierSiSolde } from "./dossierSync";

export type ResultatRapprochement = { ok: true } | { ok: false; erreur: string };

/**
 * Encaisse une transaction bancaire sur une facture.
 *
 * VERROU D'IDEMPOTENCE : la transaction est marquée « rapprochée » EN PREMIER,
 * conditionnée à son statut courant. Si un précédent essai a déjà abouti (ou
 * qu'un autre onglet vient de la traiter), 0 ligne modifiée → on s'arrête SANS
 * créer de second paiement.
 */
export async function rapprocherTransaction(
  tx: BankTransaction,
  facture: FactureBanque
): Promise<ResultatRapprochement> {
  const montant = Number(tx.montant) || 0;
  try {
    const { data: verrou, error: e0 } = await supabase
      .from("bank_transactions")
      .update({ statut: "rapproche", document_id: facture.id })
      .eq("id", tx.id)
      .eq("statut", tx.statut)
      .select("id");
    if (e0) throw e0;
    if (!verrou || verrou.length === 0) {
      return {
        ok: false,
        erreur: "Cette transaction a déjà été rapprochée (ou vient de l'être). Recharge la page.",
      };
    }

    // Paiement (virement — référence = libellé bancaire)
    const { data: paiement, error: e1 } = await supabase
      .from("paiements")
      .insert({
        dossier_id: facture.dossier_id,
        document_id: facture.id,
        montant,
        date_paiement: tx.date_transaction,
        moyen: "virement",
        reference: (tx.libelle || "").slice(0, 120) || null,
        notes: "Rapprochement bancaire",
      })
      .select()
      .single();
    if (e1) {
      // Échec de l'insert : on libère le verrou pour permettre un nouvel essai.
      await supabase
        .from("bank_transactions")
        .update({ statut: tx.statut, document_id: null })
        .eq("id", tx.id);
      throw e1;
    }

    // Facture soldée → statut payé (+ dossier « Payé » si tout est soldé)
    if (estSoldee(facture.reste, montant)) {
      await supabase.from("documents").update({ statut: "paye" }).eq("id", facture.id);
      await majDossierSiSolde(facture.dossier_id);
    }

    // Lien paiement ↔ transaction (best effort)
    await supabase
      .from("bank_transactions")
      .update({ paiement_id: paiement?.id || null })
      .eq("id", tx.id);

    return { ok: true };
  } catch (err: unknown) {
    return {
      ok: false,
      erreur: err instanceof Error ? err.message : "Erreur lors du rapprochement.",
    };
  }
}
