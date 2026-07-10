-- Migration v28 : champs spécifiques VITRAGE sur les dossiers.
-- Utilisés uniquement par les comptes métier = vitrage (bris de glace).
-- Sans effet pour les comptes carrosserie (colonnes laissées vides).
-- Idempotent : réexécutable sans risque.

alter table if exists public.dossiers
  add column if not exists type_vitrage text,          -- pare_brise | lunette_arriere | vitre_laterale | toit_ouvrant | autre
  add column if not exists nature_intervention text,   -- reparation | remplacement
  add column if not exists calibrage_requis boolean not null default false, -- ADAS (caméra pare-brise)
  add column if not exists calibrage_fait boolean not null default false,
  add column if not exists franchise numeric;          -- reste à charge client (bris de glace)
