-- ============================================================
--  My Easy Auto — Migration v34 (REFONTE DES FACTURES)
--
--  1. document_lignes : colonne "remise" (% de réduction accordée,
--     obligatoire au sens de l'art. 242 nonies A du CGI dès lors qu'une
--     réduction est acquise à la date de la vente) + colonne "categorie"
--     qui range chaque ligne dans l'un des 3 tableaux de la facture :
--       - 'piece' : tableau principal (Désignation / Qté / PU HT / Remise / Total HT)
--       - 'mo'    : tableau des postes T1, T2, T3, Peinture, Ingr. de peinture
--       - 'autre' : tableau des autres éléments du rapport
--  2. documents : "mode_paiement" (mode de règlement imprimé sur la
--     facture, choisi au moment de la génération du PDF) et
--     "jours_reparation" (durée d'immobilisation affichée en en-tête,
--     calculée depuis le dossier mais surchargeable).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. Lignes de document ----------

alter table document_lignes add column if not exists remise numeric default 0;
alter table document_lignes add column if not exists categorie text default 'piece';

-- Sécurise les valeurs héritées (null → valeurs par défaut)
update document_lignes set remise = 0 where remise is null;
update document_lignes set categorie = 'piece' where categorie is null or categorie = '';

-- Reclasse automatiquement les lignes déjà saisies : main d'œuvre / peinture
-- / ingrédients basculent dans le 2e tableau de la facture.
update document_lignes
   set categorie = 'mo'
 where categorie = 'piece'
   and designation is not null
   and (
        designation ~* '(^|[^a-z])t[[:space:]]*-?[[:space:]]*[123]([^0-9]|$)'
     or designation ~* 'main[[:space:]]*d.?[[:space:]]*(oe|œ)uvre'
     or designation ~* 'peinture'
     or designation ~* 'ingr[eé]d'
   );

-- Contrainte de cohérence : remise en pourcentage, entre 0 et 100
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'document_lignes_remise_pct'
  ) then
    alter table document_lignes
      add constraint document_lignes_remise_pct
      check (remise is null or (remise >= 0 and remise <= 100));
  end if;
end $$;

-- ---------- 2. Documents ----------

alter table documents add column if not exists mode_paiement text;
alter table documents add column if not exists jours_reparation integer;

-- mode_paiement    : virement | cheque | cb | especes | prelevement |
--                    assurance | multiple | autre  (choisi à la génération)
-- jours_reparation : durée d'immobilisation en jours (surcharge le calcul
--                    automatique fait depuis reparation_debut / reparation_fin)

-- ---------- 3. RLS (rappel : policies déjà en place sur ces tables) ----------
-- Aucune nouvelle table n'est créée : les policies existantes de
-- documents / document_lignes couvrent les nouvelles colonnes.
