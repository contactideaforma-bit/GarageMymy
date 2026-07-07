-- ============================================================
--  My Easy Auto — Migration v25
--  QUOTA IA : chaque utilisateur dispose de 15 €/mois d'analyses IA
--  (rapports, cartes grises). Suivi de consommation par mois +
--  crédits supplémentaires accordés manuellement en cas d'achat.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

-- Consommation par utilisateur et par mois (remplie par le SERVEUR)
create table if not exists public.usage_ia (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mois text not null,                      -- 'AAAA-MM'
  appels integer not null default 0,
  tokens_entree bigint not null default 0,
  tokens_sortie bigint not null default 0,
  cout_eur numeric not null default 0,
  unique (owner_id, mois)
);

alter table public.usage_ia enable row level security;
drop policy if exists usage_ia_select on public.usage_ia;
create policy usage_ia_select on public.usage_ia
  for select to authenticated using (owner_id = auth.uid());
-- écriture UNIQUEMENT par le serveur (service role)

-- Crédits supplémentaires (ajoutés à la main après achat — gestion manuelle)
create table if not exists public.credits_ia (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  mois text not null,                      -- 'AAAA-MM' où le crédit s'applique
  montant_eur numeric not null,
  note text
);

alter table public.credits_ia enable row level security;
drop policy if exists credits_ia_select on public.credits_ia;
create policy credits_ia_select on public.credits_ia
  for select to authenticated using (owner_id = auth.uid());
-- ajout UNIQUEMENT par l'administrateur (table editor / service role)
