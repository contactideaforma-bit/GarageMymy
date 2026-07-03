-- ============================================================
--  GarageMYMY — Migration v10
--  SUIVI BANCAIRE : transactions bancaires (import CSV aujourd'hui,
--  synchronisation API Enable Banking demain) + rapprochement
--  automatique avec les factures.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v8 déjà passée (modèle owner_id en place).
-- ============================================================

-- ---------- Transactions bancaires ----------
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  date_transaction date,
  libelle text,
  montant numeric,            -- signé : crédit > 0, débit < 0
  reference text,
  compte text,                -- libellé du compte (optionnel)
  source text not null default 'csv',      -- csv | api
  statut text not null default 'nouveau',  -- nouveau | rapproche | ignore
  document_id uuid references public.documents(id) on delete set null,
  paiement_id uuid references public.paiements(id) on delete set null,
  hash text,                  -- empreinte date|libelle|montant pour dédupliquer les imports
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists bank_transactions_owner_idx on public.bank_transactions(owner_id);
create index if not exists bank_transactions_statut_idx on public.bank_transactions(owner_id, statut);
-- Anti-doublon : le même relevé peut être réimporté sans dupliquer.
create unique index if not exists bank_transactions_hash_uniq
  on public.bank_transactions(owner_id, hash) where hash is not null;

alter table public.bank_transactions enable row level security;
drop policy if exists bank_transactions_owner on public.bank_transactions;
create policy bank_transactions_owner on public.bank_transactions
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- Connexion bancaire API (Enable Banking) ----------
-- Secrets d'agrégation bancaire : comme mail_config, RLS SANS policy
-- → INACCESSIBLE depuis le client ; accès serveur via clé SERVICE ROLE.
create table if not exists public.bank_connections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'enable_banking',
  session_id text,            -- session/consentement côté agrégateur
  compte_iban text,
  statut text not null default 'inactif',  -- inactif | actif | expire
  last_sync timestamptz
);

create index if not exists bank_connections_owner_idx on public.bank_connections(owner_id);
alter table public.bank_connections enable row level security;
-- AUCUNE policy : table réservée au serveur (service role).
