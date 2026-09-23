-- ============================================================
--  MIGRATION v87 — MODE EXPERT : CONTRÔLE DU DEVIS (v13.23)
--
--  L'appli expert se recentre sur la confrontation du devis du
--  réparateur au pré-rapport de l'expert. Un « contrôle » = un tour de
--  comparaison : pré-rapport (référence) + devis du garage, écarts
--  ligne à ligne avec la décision de l'expert (à trancher / accepté /
--  refusé + motif), commentaire, journal des actions et conclusion.
--  Un 2e tour (devis rectifié par le garage) est rattaché au 1er
--  (parent_id) et part du chiffrage attendu.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists expertise_controles (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid not null references expertise_dossiers (id) on delete cascade,
  tour integer not null default 1,
  parent_id uuid references expertise_controles (id) on delete set null,
  statut text not null default 'a_trancher',        -- a_trancher | attente_garage | valide
  conclusion text,                                   -- devis_valide | conformite_demandee | chiffrage_expert
  reference jsonb,                                   -- pré-rapport lu (chocs, opérations, source, document)
  devis jsonb,                                       -- devis du garage lu
  ecarts jsonb not null default '[]'::jsonb,         -- écarts + décisions + motifs
  commentaire text,
  journal jsonb not null default '[]'::jsonb,        -- qui a fait quoi, quand (garde-fou)
  resultat jsonb,                                    -- chiffrage retenu figé à la conclusion
  rapport_id uuid references expertise_rapports (id) on delete set null,
  cloture_le timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists expertise_controles_owner_idx on expertise_controles (owner_id, updated_at desc);
create index if not exists expertise_controles_dossier_idx on expertise_controles (dossier_id, tour);

alter table expertise_controles enable row level security;
drop policy if exists expertise_controles_owner on expertise_controles;
create policy expertise_controles_owner on expertise_controles
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

comment on table expertise_controles is 'Contrôle du devis du réparateur face au pré-rapport de l''expert (v13.23).';
