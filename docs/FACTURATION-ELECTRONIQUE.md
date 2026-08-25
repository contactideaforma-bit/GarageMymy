# Facturation électronique — feuille de route My Easy Auto

Réforme 2026-2027 : réception obligatoire via plateforme agréée (PA) pour
tous au **1er septembre 2026**, émission obligatoire pour les PME/TPE au
**1er septembre 2027**, e-reporting pour le B2C. Formats acceptés : Factur-X,
UBL, CII. Une application métier ne devient pas PA : elle se branche sur
l'API d'une PA.

## Étape 1 — livrée (v52, 25/08/2026)

- Migration `supabase/migration_v52.sql` : `entreprise.fe_plateforme /
  fe_plateforme_ref / fe_choisie_le / fe_reception_ok / tva_debits`,
  `dossiers.client_siren / assureur_siren`, `assureurs.siren`,
  `clients.siren`, `documents.fe_statut / fe_reference / fe_transmis_le`.
- `src/lib/facturx.ts` : XML CII **profil BASIC** (lignes, TVA, franchise
  293 B, DueDateTypeCode 5/72 selon l'option TVA sur les débits, ShipTo =
  lieu de la prestation, BuyerReference = n° de sinistre), contrôle des
  mentions manquantes (`verifierFacturx`), validation Luhn du SIREN.
- `POST /api/facturx` : incruste le XML dans le PDF jsPDF avec **pdf-lib**
  (pièce jointe `factur-x.xml`, AFRelationship Data, XMP PDF/A-3 + schéma
  Factur-X). ⚠️ `npm install` requis (dépendance ajoutée à package.json).
- PDF facture : lignes SIREN (client / assureur), mention « Nature de
  l'opération … Lieu de la prestation … », mention TVA sur les débits.
- Fiche dossier : bouton **Factur-X** sur chaque facture ; envoi par email
  d'une facture = Factur-X automatiquement quand les mentions le permettent.
- Profil du garage : section « Facturation électronique » (PA désignée,
  date, réception testée, option TVA sur les débits).
- Annuaire assureurs et clients : champ SIREN ; le SIREN de l'annuaire est
  reporté sur le dossier à l'enregistrement.
- Recherche de SIREN : `GET /api/siren?q=` (proxy vers l'API publique
  recherche-entreprises.api.gouv.fr, gratuite, sans clé), composant
  `RechercheSiren` (bouton « 🔍 SIREN ») dans l'annuaire des assureurs, la
  liste des clients et le formulaire de dossier ; bouton « Compléter les
  SIREN » dans l'annuaire (propositions à valider une par une).
- Vitrine : note d'information sur l'accueil + page publique
  `/facturation-electronique`.

Limite connue : jsPDF n'embarque pas ses polices standard → conformité
PDF/A-3 stricte non garantie par un validateur (veraPDF). Le XML est complet.

## Étape 2 — à livrer avant le 1er septembre 2027

| Quand | Quoi |
|---|---|
| **Sept.–oct. 2026** | Choisir la PA partenaire (critères : API REST documentée, bac à sable gratuit, tarif par facture ou forfait éditeur, réception gratuite pour le garage, interopérabilité annuaire). Ouvrir le compte bac à sable. |
| **Nov. 2026** | Police TTF embarquée dans jsPDF (PDF/A-3 strict), validation veraPDF + validateur Factur-X FNFE. |
| **Déc. 2026 – janv. 2027** | Envoi d'une facture à la PA depuis la fiche dossier (`fe_reference`, `fe_transmis_le`), réception des statuts (webhook ou interrogation) → `documents.fe_statut`. Une facture « rejetée » = action automatique du matin (`lib/actions.ts`). |
| **Févr.–mars 2027** | E-reporting : factures aux particuliers (B2C) et encaissements (depuis `paiements` / rapprochement bancaire). Journal des transmissions. |
| **Avr.–mai 2027** | Factures fournisseurs reçues via la PA → rapprochement avec `commandes_pieces`. Export comptable enrichi. |
| **Juin 2027** | Pilote sur 3 garages, formation, mise à jour de la page publique et de la plaquette. |
| **Juillet 2027** | Généralisation ; IDEAFORMA émet ses propres factures d'abonnement via la même PA. |

Points ouverts : régime de TVA d'IDEAFORMA (franchise 293 B ou TVA) ;
choix entre PA unique intégrée ou multi-PA ; coût par facture répercuté ou
inclus dans l'abonnement.
