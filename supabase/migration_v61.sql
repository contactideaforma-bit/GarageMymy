-- ============================================================
--  My Easy Auto — Migration v61 (v11.2)
--
--  1. MENTIONS PARTICULIÈRES DU RAPPORT D'EXPERTISE
--     L'analyse détecte les mentions qui changent la conduite du dossier
--     (« expertise à titre conservatoire », « sursis à travaux »,
--     procédure VGE, VEI, règlement direct absent/suspendu, TVA
--     récupérable, franchise, vétusté…) et les range sur le dossier pour
--     les afficher en alerte (fiche, éditeur de facture, liste).
--     Format : tableau JSON [{code, gravite, libelle, conseil, extrait, montant}].
--
--  2. AGRÉMENTS À TARIF PARTICULIER
--     Une particularité de type « agrément » peut porter les tarifs
--     négociés avec l'assureur : taux horaires T1/T2/T3/peinture,
--     taux des ingrédients, remises pièces / main d'œuvre, et les mots
--     clés de l'assureur pour rattacher automatiquement les dossiers
--     importés. L'éditeur de facture propose d'appliquer ces tarifs et
--     signale les écarts avec le rapport (jamais de correction auto).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.dossiers add column if not exists mentions_rapport jsonb;

alter table public.particularites add column if not exists taux_t1 numeric;
alter table public.particularites add column if not exists taux_t2 numeric;
alter table public.particularites add column if not exists taux_t3 numeric;
alter table public.particularites add column if not exists taux_peinture numeric;
alter table public.particularites add column if not exists taux_ingredients numeric;
alter table public.particularites add column if not exists remise_pieces numeric;   -- % sur les pièces
alter table public.particularites add column if not exists remise_mo numeric;       -- % sur la main d'œuvre
alter table public.particularites add column if not exists assureurs text;          -- mots clés (« MAIF, Filia »)
