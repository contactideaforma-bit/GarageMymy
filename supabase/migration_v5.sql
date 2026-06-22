-- ============================================================
--  GarageMYMY — Migration v5
--  Paiements & relances (encaissement des factures).
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

-- Échéance de règlement sur les documents (factures surtout)
alter table public.documents add column if not exists date_echeance date;

-- Paiements reçus (un ou plusieurs par facture)
create table if not exists public.paiements (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  montant numeric(10,2) not null default 0,
  date_paiement date not null default current_date,
  moyen text default 'virement',     -- virement|cheque|cb|especes|autre
  reference text,
  notes text
);

-- Relances d'encaissement (journal)
create table if not exists public.relances (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  document_id uuid references public.documents(id) on delete cascade,
  date_relance date not null default current_date,
  canal text default 'email',        -- email|telephone|courrier|autre
  notes text
);

create index if not exists paiements_document_idx on public.paiements(document_id);
create index if not exists paiements_dossier_idx on public.paiements(dossier_id);
create index if not exists relances_document_idx on public.relances(document_id);

alter table public.paiements enable row level security;
alter table public.relances enable row level security;

drop policy if exists "paiements_all_anon" on public.paiements;
create policy "paiements_all_anon" on public.paiements for all using (true) with check (true);

drop policy if exists "relances_all_anon" on public.relances;
create policy "relances_all_anon" on public.relances for all using (true) with check (true);
