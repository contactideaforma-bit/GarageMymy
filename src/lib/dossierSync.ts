// Synchronisation du dossier avec la réalité des paiements + choix du bon
// destinataire de relance selon le mode de règlement (côté CLIENT).

import { supabase } from "./supabaseClient";
import { Dossier, Paiement } from "./types";
import { STATUTS_ORDRE } from "./format";
import { resteAPayer, totalPaye } from "./paiements";

/**
 * Si TOUTES les factures du dossier sont soldées, fait passer le dossier
 * en « Payé » (sans jamais reculer ni toucher un dossier clôturé).
 * À appeler après chaque encaissement (saisie manuelle ou rapprochement).
 */
export async function majDossierSiSolde(dossierId: string) {
  const { data: factures } = await supabase
    .from("documents")
    .select("id,total_ttc")
    .eq("dossier_id", dossierId)
    .eq("type", "facture");
  if (!factures || factures.length === 0) return;

  const ids = factures.map((f) => f.id);
  const { data: paiements } = await supabase
    .from("paiements")
    .select("document_id,montant")
    .in("document_id", ids);

  const solde = factures.every(
    (f) =>
      resteAPayer(
        f.total_ttc,
        totalPaye(((paiements as Paiement[]) || []).filter((p) => p.document_id === f.id))
      ) <= 0
  );
  if (!solde) return;

  const { data: d } = await supabase.from("dossiers").select("statut").eq("id", dossierId).single();
  if (!d) return;
  const pos = STATUTS_ORDRE.indexOf(d.statut as (typeof STATUTS_ORDRE)[number]);
  const posPaye = STATUTS_ORDRE.indexOf("paye");
  if (pos === -1 || pos >= posPaye) return; // déjà payé ou clôturé

  await supabase.from("dossiers").update({ statut: "paye" }).eq("id", dossierId);
  await supabase.from("evenements").insert({
    dossier_id: dossierId,
    titre: "Dossier soldé",
    description: "Toutes les factures sont payées : statut passé en Payé automatiquement.",
    date_evenement: new Date().toISOString(),
    categorie: "autre",
  });
}

/**
 * Destinataire d'une relance de paiement, selon le processus :
 * - cession de créance (mode activé OU cession signée) → l'ASSURANCE doit payer ;
 * - cas normal → le CLIENT doit payer (l'assurance le rembourse, lui).
 * Renvoie aussi `pro` (professionnel ?) pour adapter le ton de la mise en demeure.
 */
export async function destinataireRelance(
  dossier: Dossier
): Promise<{ to: string; pro: boolean }> {
  let cession = Boolean(dossier.mode_cession);
  if (!cession) {
    const { data } = await supabase
      .from("cessions_creance")
      .select("id")
      .eq("dossier_id", dossier.id)
      .eq("statut", "signe")
      .limit(1);
    cession = Boolean(data && data.length > 0);
  }
  if (cession) return { to: dossier.assureur_email || "", pro: true };

  // Cas normal : email du client (table clients, par nom)
  let to = "";
  if (dossier.client_nom) {
    const { data } = await supabase
      .from("clients")
      .select("nom,email")
      .not("email", "is", null);
    const c = ((data as { nom: string | null; email: string | null }[]) || []).find(
      (x) => (x.nom || "").trim().toLowerCase() === dossier.client_nom!.trim().toLowerCase()
    );
    to = c?.email || "";
  }
  return { to, pro: false };
}
