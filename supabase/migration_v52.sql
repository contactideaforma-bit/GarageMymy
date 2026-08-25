-- ============================================================
--  My Easy Auto — Migration v52
--
--  FACTURATION ÉLECTRONIQUE — ÉTAPE 1 (réforme 2026-2027).
--
--  · Réception obligatoire pour tous au 1er septembre 2026 : le garage
--    désigne sa plateforme agréée (PA) → colonnes fe_* sur `entreprise`.
--  · Émission obligatoire pour les PME au 1er septembre 2027 : on prépare
--    les NOUVELLES MENTIONS (SIREN du client, nature de l'opération, option
--    TVA sur les débits) et le suivi du cycle de vie des factures.
--  · Le format Factur-X (PDF + XML) est produit par l'application ; le
--    SIREN du destinataire est indispensable dans le XML.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- 1. Profil du garage : plateforme agréée + option TVA
alter table public.entreprise
  add column if not exists fe_plateforme     text,      -- nom de la PA choisie
  add column if not exists fe_plateforme_ref text,      -- identifiant / n° d'immatriculation de la PA
  add column if not exists fe_choisie_le     date,      -- date de désignation
  add column if not exists fe_reception_ok   boolean not null default false, -- réception testée
  add column if not exists tva_debits        boolean not null default false; -- option « TVA sur les débits »

comment on column public.entreprise.fe_plateforme is 'Plateforme agréée (PA) désignée par le garage pour recevoir / émettre ses factures électroniques.';
comment on column public.entreprise.tva_debits is 'Option TVA sur les débits (mention obligatoire sur les factures électroniques si applicable).';

-- 2. SIREN des destinataires professionnels (mention obligatoire)
alter table public.dossiers
  add column if not exists client_siren   text,
  add column if not exists assureur_siren text;

alter table public.assureurs add column if not exists siren text;
alter table public.clients   add column if not exists siren text;

-- 3. Cycle de vie de la facture électronique (étape 2 : alimenté par la PA)
alter table public.documents
  add column if not exists fe_statut      text,        -- deposee | rejetee | recue | acceptee | refusee | payee …
  add column if not exists fe_reference   text,        -- identifiant renvoyé par la PA
  add column if not exists fe_transmis_le timestamptz;

create index if not exists documents_fe_statut_idx on public.documents (fe_statut) where fe_statut is not null;
