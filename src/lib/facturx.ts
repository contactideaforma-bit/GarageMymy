// ============================================================
//  FACTUR-X — génération du XML CII (profil BASIC), v52.
//
//  Réforme de la facturation électronique : les factures B2B devront
//  transiter par une plateforme agréée dans l'un des formats acceptés
//  (Factur-X, UBL, CII). Factur-X = un PDF lisible + ce XML embarqué.
//
//  Ce module construit le XML à partir du document, de ses lignes, du
//  dossier et du profil du garage. Il est PUR (aucun accès réseau) et
//  s'exécute côté navigateur ; l'incrustation dans le PDF se fait dans
//  /api/facturx (pdf-lib), qui ajoute aussi les métadonnées XMP.
//
//  Points de vigilance :
//   · SIREN du destinataire = mention obligatoire → `verifierFacturx`
//     renvoie la liste des manques AVANT de générer ;
//   · nature de l'opération déduite des lignes (pièces = biens,
//     main d'œuvre / peinture = services) ;
//   · option « TVA sur les débits » → DueDateTypeCode 5, sinon 72
//     (encaissements, régime de droit commun des prestations) ;
//   · franchise en base (taux 0) → catégorie E + motif art. 293 B.
// ============================================================

import { Document, DocumentLigne, Dossier, Entreprise } from "./types";
import { categorieDe, computeTotaux, totalLigne } from "./documents";

export type NatureOperation = "biens" | "services" | "mixte";

/** Biens / services / mixte, d'après les catégories des lignes facturées. */
export function natureOperation(lignes: DocumentLigne[]): NatureOperation {
  const avecMontant = lignes.filter((l) => totalLigne(l) !== 0 || (Number(l.quantite) || 0) > 0);
  const biens = avecMontant.some((l) => categorieDe(l) === "piece");
  const services = avecMontant.some((l) => categorieDe(l) !== "piece");
  if (biens && services) return "mixte";
  return biens ? "biens" : "services";
}

export function libelleNature(n: NatureOperation): string {
  return n === "mixte"
    ? "livraison de biens et prestation de services"
    : n === "biens"
      ? "livraison de biens"
      : "prestation de services";
}

/** Nettoie un SIREN / SIRET saisi (espaces, points) et renvoie les 9 chiffres du SIREN. */
export function sirenDepuis(valeur: string | null | undefined): string {
  const chiffres = (valeur || "").replace(/\D/g, "");
  return chiffres.length >= 9 ? chiffres.slice(0, 9) : chiffres;
}

export function sirenValide(valeur: string | null | undefined): boolean {
  const s = sirenDepuis(valeur);
  if (!/^\d{9}$/.test(s)) return false;
  // Clé de Luhn (les SIREN la respectent, sauf cas historiques rarissimes).
  let somme = 0;
  for (let i = 0; i < 9; i++) {
    let n = Number(s[i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    somme += n;
  }
  return somme % 10 === 0;
}

/** Le destinataire de la facture : l'assureur quand le dossier est en cession / PEC, sinon le client. */
export function destinataireFacture(dossier: Dossier): {
  type: "assureur" | "client";
  nom: string;
  adresse: string;
  codePostal: string;
  ville: string;
  siren: string;
} {
  const versAssureur = Boolean(dossier.mode_cession) || Boolean(dossier.mode_pec);
  if (versAssureur && dossier.assureur) {
    return {
      type: "assureur",
      nom: dossier.assureur,
      adresse: dossier.assureur_adresse || "",
      codePostal: "",
      ville: "",
      siren: sirenDepuis(dossier.assureur_siren),
    };
  }
  return {
    type: "client",
    nom: dossier.client_nom || "",
    adresse: dossier.client_adresse || "",
    codePostal: dossier.client_code_postal || "",
    ville: dossier.client_ville || "",
    siren: sirenDepuis(dossier.client_siren),
  };
}

/** Ce qui manque pour produire un Factur-X conforme. Vide = OK. */
export function verifierFacturx(doc: Document, dossier: Dossier, ent: Partial<Entreprise>): string[] {
  const manques: string[] = [];
  if (doc.type !== "facture") manques.push("Seules les factures sont produites au format Factur-X.");
  if (!doc.numero) manques.push("Numéro de facture manquant.");
  if (!doc.date_document) manques.push("Date de facture manquante.");
  if (!sirenValide(ent.siret)) manques.push("SIRET du garage manquant ou invalide (Profil du garage).");
  if (!ent.nom) manques.push("Nom du garage manquant (Profil du garage).");
  const dest = destinataireFacture(dossier);
  if (!dest.nom) manques.push("Destinataire de la facture manquant.");
  if (dest.type === "assureur") {
    if (!sirenValide(dest.siren)) manques.push(`SIREN de l'assureur « ${dest.nom} » manquant ou invalide (fiche dossier ou annuaire).`);
  } else if (dest.siren && !sirenValide(dest.siren)) {
    manques.push("SIREN du client invalide.");
  }
  return manques;
}

/* ------------------------------- XML ------------------------------- */

function esc(s: string | null | undefined): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c] || c);
}
function dateCii(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  const dd = isNaN(d.getTime()) ? new Date() : d;
  return `${dd.getFullYear()}${String(dd.getMonth() + 1).padStart(2, "0")}${String(dd.getDate()).padStart(2, "0")}`;
}
function montant(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/** Construit le XML Factur-X (profil BASIC). Suppose `verifierFacturx` vide. */
export function construireXmlFacturx(
  doc: Document,
  lignes: DocumentLigne[],
  dossier: Dossier,
  ent: Partial<Entreprise>
): string {
  const taux = Number(doc.tva) || 0;
  const totaux = computeTotaux(lignes, doc.tva);
  const dest = destinataireFacture(dossier);
  const nature = natureOperation(lignes);
  const franchise = taux === 0;
  const categorieTva = franchise ? "E" : "S";
  const dueDateType = ent.tva_debits ? "5" : nature === "biens" ? "5" : "72";
  const sirenGarage = sirenDepuis(ent.siret);
  const lignesUtiles = lignes.filter((l) => (l.designation || "").trim());

  const notes: string[] = [
    `Nature de l'opération : ${libelleNature(nature)}.`,
    `Sinistre n° ${dossier.numero_sinistre || "—"} · véhicule ${dossier.marque_modele || ""} ${dossier.immatriculation || ""}`.trim(),
  ];
  if (dest.type === "assureur") notes.push(`Facture adressée à l'assureur pour le compte de ${dossier.client_nom || "l'assuré"}.`);
  if (franchise) notes.push("TVA non applicable, art. 293 B du CGI.");
  if (ent.tva_debits) notes.push("Option pour le paiement de la TVA d'après les débits.");

  const xmlLignes = lignesUtiles
    .map((l, i) => {
      const q = Number(l.quantite) || 0;
      const pu = Number(l.prix_unitaire) || 0;
      const remise = Number(l.remise) || 0;
      const puNet = pu * (1 - remise / 100);
      return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(l.designation)}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${montant(puNet)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="${categorieDe(l) === "piece" ? "C62" : "HUR"}">${montant(q)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax><ram:TypeCode>VAT</ram:TypeCode><ram:CategoryCode>${categorieTva}</ram:CategoryCode><ram:RateApplicablePercent>${montant(taux)}</ram:RateApplicablePercent></ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${montant(totalLigne(l))}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
    })
    .join("");

  const adresse = (a: { adresse?: string | null; codePostal?: string | null; ville?: string | null }) => `
        <ram:PostalTradeAddress>
          ${a.codePostal ? `<ram:PostcodeCode>${esc(a.codePostal)}</ram:PostcodeCode>` : ""}
          ${a.adresse ? `<ram:LineOne>${esc(a.adresse)}</ram:LineOne>` : ""}
          ${a.ville ? `<ram:CityName>${esc(a.ville)}</ram:CityName>` : ""}
          <ram:CountryID>FR</ram:CountryID>
        </ram:PostalTradeAddress>`;

  const iban = (ent.iban || "").replace(/\s+/g, "");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100" xmlns:qdt="urn:un:unece:uncefact:data:standard:QualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017#compliant#urn:factur-x.eu:1p0:basic</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(doc.numero)}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${dateCii(doc.date_document)}</udt:DateTimeString></ram:IssueDateTime>
${notes.map((n) => `    <ram:IncludedNote><ram:Content>${esc(n)}</ram:Content></ram:IncludedNote>`).join("\n")}
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${xmlLignes}
    <ram:ApplicableHeaderTradeAgreement>
      ${dossier.numero_sinistre ? `<ram:BuyerReference>${esc(dossier.numero_sinistre)}</ram:BuyerReference>` : ""}
      <ram:SellerTradeParty>
        <ram:Name>${esc(ent.nom)}</ram:Name>
        <ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${sirenGarage}</ram:ID></ram:SpecifiedLegalOrganization>${adresse({ adresse: ent.adresse, codePostal: ent.code_postal, ville: ent.ville })}
        ${ent.tva_intra ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc((ent.tva_intra || "").replace(/\s+/g, ""))}</ram:ID></ram:SpecifiedTaxRegistration>` : ""}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(dest.nom)}</ram:Name>
        ${dest.siren ? `<ram:SpecifiedLegalOrganization><ram:ID schemeID="0002">${dest.siren}</ram:ID></ram:SpecifiedLegalOrganization>` : ""}${adresse(dest)}
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery>
      <ram:ShipToTradeParty>
        <ram:Name>${esc(ent.nom)} (lieu de la prestation)</ram:Name>${adresse({ adresse: ent.adresse, codePostal: ent.code_postal, ville: ent.ville })}
      </ram:ShipToTradeParty>
      <ram:ActualDeliverySupplyChainEvent><ram:OccurrenceDateTime><udt:DateTimeString format="102">${dateCii(dossier.reparation_fin || doc.date_document)}</udt:DateTimeString></ram:OccurrenceDateTime></ram:ActualDeliverySupplyChainEvent>
    </ram:ApplicableHeaderTradeDelivery>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      <ram:SpecifiedTradeSettlementPaymentMeans>
        <ram:TypeCode>${iban ? "30" : "1"}</ram:TypeCode>
        ${iban ? `<ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount>` : ""}
      </ram:SpecifiedTradeSettlementPaymentMeans>
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${montant(totaux.tva)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${franchise ? "<ram:ExemptionReason>TVA non applicable, art. 293 B du CGI</ram:ExemptionReason>" : ""}
        <ram:BasisAmount>${montant(totaux.ht)}</ram:BasisAmount>
        <ram:CategoryCode>${categorieTva}</ram:CategoryCode>
        ${franchise ? "<ram:ExemptionReasonCode>VATEX-FR-FRANCHISE</ram:ExemptionReasonCode>" : ""}
        <ram:DueDateTypeCode>${dueDateType}</ram:DueDateTypeCode>
        <ram:RateApplicablePercent>${montant(taux)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>
      <ram:SpecifiedTradePaymentTerms>
        <ram:DueDateDateTime><udt:DateTimeString format="102">${dateCii(doc.date_echeance || doc.date_document)}</udt:DateTimeString></ram:DueDateDateTime>
      </ram:SpecifiedTradePaymentTerms>
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${montant(totaux.ht)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${montant(totaux.ht)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${montant(totaux.tva)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${montant(totaux.ttc)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${montant(totaux.ttc)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>
`;
}
