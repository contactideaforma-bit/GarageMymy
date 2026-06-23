-- ============================================================
--  GarageMYMY — Migration : Devis & Factures
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  type text not null,                         -- 'devis' | 'facture'
  numero text,
  date_document date default current_date,
  statut text not null default 'brouillon',   -- brouillon|envoye|accepte|refuse|paye
  tva numeric(5,2) default 20,
  notes text,
  total_ht numeric(10,2) default 0,
  total_tva numeric(10,2) default 0,
  total_ttc numeric(10,2) default 0
);

create table if not exists public.document_lignes (
  id uuid primary key default gen_random_uuid(),
  document_id uuid references public.documents(id) on delete cascade,
  designation text,
  quantite numeric(10,2) default 1,
  prix_unitaire numeric(10,2) default 0,
  ordre int default 0
);

alter table public.documents enable row level security;
alter table public.document_lignes enable row level security;

drop policy if exists "documents_all_anon" on public.documents;
create policy "documents_all_anon" on public.documents
  for all using (true) with check (true);

drop policy if exists "document_lignes_all_anon" on public.document_lignes;
create policy "document_lignes_all_anon" on public.document_lignes
  for all using (true) with check (true);
