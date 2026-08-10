-- ============================================================
--  My Easy Auto — Migration v38
--
--  1. NOTE LIBRE PAR DOSSIER : un bloc-notes rattaché au sinistre,
--     ouvert depuis le bouton rond en bas à droite de la fiche.
--     Une simple colonne texte suffit (une note par dossier).
--
--  2. ARDOISE : le pense-bête du garage sur le tableau de bord —
--     des lignes libres que l'on coche quand c'est fait.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. Note du dossier ----------

alter table dossiers add column if not exists note text;
alter table dossiers add column if not exists note_maj timestamptz;

-- ---------- 2. Ardoise (pense-bête du tableau de bord) ----------

create table if not exists public.ardoise (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  texte text not null,
  fait boolean not null default false,
  fait_le timestamptz,
  ordre integer not null default 0,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists ardoise_owner_idx on public.ardoise(owner_id, fait, ordre);

alter table public.ardoise enable row level security;
drop policy if exists ardoise_owner on public.ardoise;
create policy ardoise_owner on public.ardoise
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
