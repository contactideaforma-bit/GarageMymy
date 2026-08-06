// Synchronisation du dossier avec la réalité des paiements + choix du bon
// destinataire de relance selon le mode de règlement (côté CLIENT).

import { supabase } from "./supabaseClient";
import { Dossier, Paiement } from "./types";
import { STATUTS_ORDRE } from "./format";
import { estSoldee, totalPaye } from "./paiements";

/**
 * Fait AVANCER le statut d'un dossier vers `cible` — jamais reculer.
 * Les statuts hérités v0 (indexOf = -1) sont traités comme antérieurs.
 */
export async function avancerStatut(
  dossier: { id: string; statut: string },
  cible: (typeof STATUTS_ORDRE)[number],
  extra?: Record<string, unknown>
): Promise<boolean> {
  const posActuel = STATUTS_ORDRE.indexOf(dossier.statut as (typeof STATUTS_ORDRE)[number]);
  const posCible = STATUTS_ORDRE.indexOf(cible);
  const avance = posCible !== -1 && posActuel < posCible;
  const updates: Record<string, unknown> = { ...(extra || {}) };
  if (avance) updates.statut = cible;
  if (Object.keys(updates).length === 0) return false;
  await supabase.from("dossiers").update(updates).eq("id", dossier.id);
  return avance;
}

/**
 * ENVOI D'UNE FACTURE (v6.7) : la facture passe en « Envoyé » et le dossier
 * avance automatiquement à l'étape 5 « Facture envoyée ». Le règlement, lui,
 * ne dépend que des encaissements réels (cf. majDossierSiSolde).
 */
export async function marquerFactureEnvoyee(
  facture: { id: string; numero?: string | null; statut?: string | null },
  dossier: { id: string; statut: string }
): Promise<void> {
  // Le statut du document ne recule pas non plus (accepté / payé restent).
  if (!facture.statut || facture.statut === "brouillon") {
    await supabase.from("documents").update({ statut: "envoye" }).eq("id", facture.id);
  }
  const avance = await avancerStatut(dossier, "facture");
  if (avance) {
    await supabase.from("evenements").insert({
      dossier_id: dossier.id,
      titre: "Facture envoyée",
      description: `Facture ${facture.numero || ""} envoyée — dossier passé en « Facture envoyée ».`.trim(),
      date_evenement: new Date().toISOString(),
      categorie: "autre",
    });
  }
}

/**
 * Si TOUTES les factures du dossier sont réellement ENCAISSÉES, fait passer le
 * dossier en « Payé » (sans jamais reculer ni toucher un dossier clôturé).
 * À appeler après chaque encaissement (saisie manuelle ou rapprochement bancaire).
 * NB : le solde est basé uniquement sur les PAIEMENTS reçus. La mention
 * « Acquittée » (chèque de caution) n'a AUCUN impact ici — ce n'est pas un règlement.
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

  // estSoldee = même tolérance d'arrondi (1 centime) que partout ailleurs.
  const solde = factures.every((f) =>
    estSoldee(
      f.total_ttc,
      totalPaye(((paiements as Paiement[]) || []).filter((p) => p.document_id === f.id))
    )
  );
  if (!solde) return;

  const { data: d } = await supabase.from("dossiers").select("statut").eq("id", dossierId).single();
  if (!d) return;
  const pos = STATUTS_ORDRE.indexOf(d.statut as (typeof STATUTS_ORDRE)[number]);
  const posPaye = STATUTS_ORDRE.indexOf("paye");
  // Statuts hérités v0 (en_cours, termine…) : indexOf = -1. On les laisse
  // passer en « Payé » au lieu de les traiter comme déjà payés.
  // v6.7 : « Payé » est le statut FINAL (payé = clôturé) ; 'cloture' est un
  // reliquat d'avant la migration v36.
  if (pos >= posPaye || d.statut === "cloture") return;

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
 * - PRISE EN CHARGE (mode_pec) → l'assurance règle DIRECTEMENT le garage :
 *   c'est elle qu'on relance (ton pro), jamais le client ;
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
  if (cession || dossier.mode_pec) return { to: dossier.assureur_email || "", pro: true };

  // Cas normal : email du client (sur le dossier, sinon table clients par nom)
  if (dossier.client_email) return { to: dossier.client_email, pro: false };
  let to = "";
  if (dossier.client_nom) {
    // Recherche ciblée (ilike = insensible à la casse) au lieu de charger
    // toute la table (plafond PostgREST à 1000 lignes → matchs manqués).
    const { data } = await supabase
      .from("clients")
      .select("nom,email")
      .not("email", "is", null)
      .ilike("nom", dossier.client_nom.trim())
      .limit(1);
    to = (data && data[0]?.email) || "";
  }
  return { to, pro: false };
}
