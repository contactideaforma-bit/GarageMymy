-- ============================================================
--  MIGRATION v93 — v13.33 : SUIVI DES PAIEMENTS (espace éditeur)
--  • mensualités : échéance, niveau de relance, lien de paiement Qonto ;
--  • journal des relances envoyées aux garages (paiement_relances) ;
--  • suspension automatique pour impayé (comptes_etat, motif 'impaye').
--  Idempotent. Tables de l'espace admin : RLS activée SANS politique
--  (accès exclusivement par /api/admin/* en service role).
-- ============================================================

alter table public.abonnement_mensualites add column if not exists echeance date;              -- date limite de paiement (défaut : periode + jours param.)
alter table public.abonnement_mensualites add column if not exists relance_niveau integer not null default 0; -- 0 aucune · 1 rappel · 2 relance · 3 avertissement · 4 suspension
alter table public.abonnement_mensualites add column if not exists relance_le timestamptz;
alter table public.abonnement_mensualites add column if not exists qonto_link_id text;
alter table public.abonnement_mensualites add column if not exists qonto_url text;
alter table public.abonnement_mensualites add column if not exists qonto_statut text;            -- open | processing | paid | expired | canceled
alter table public.abonnement_mensualites add column if not exists mode_paiement text;           -- qonto | virement | cheque | especes | autre (renseigné au pointage)

create table if not exists public.paiement_relances (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  mensualite_id   uuid references public.abonnement_mensualites(id) on delete cascade,
  abonnement_id   uuid references public.abonnements(id) on delete cascade,
  garage_nom      text,
  email           text,
  niveau          integer not null,          -- 1 rappel · 2 relance · 3 avertissement · 4 suspension · 5 réactivation
  canal           text not null default 'email', -- email | auto | manuel
  auteur          text,                      -- 'cron' ou email de l'éditeur
  sujet           text,
  ok              boolean not null default true,
  erreur          text
);
alter table public.paiement_relances enable row level security;
create index if not exists paiement_relances_mens_idx on public.paiement_relances (mensualite_id, created_at desc);
create index if not exists mensualites_impayees_idx on public.abonnement_mensualites (periode) where payee_le is null;

comment on column public.abonnement_mensualites.relance_niveau is 'v13.33 — dernier palier de relance envoyé (0..4)';
comment on table  public.paiement_relances is 'v13.33 — journal des relances de paiement envoyées aux garages';
