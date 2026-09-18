-- ============================================================
--  MIGRATION v76 — MODE EXPERT : base de données (v13.6)
--  Assurances (mandants) et clients (lésés) du cabinet, en plus des
--  réparateurs (expertise_garages, v75). Alimentées à la main, par
--  recherche SIREN/SIRET, par import Excel/CSV/PDF, et automatiquement à
--  la création d'un dossier. RLS par compte.
-- ============================================================

create table if not exists expertise_assurances (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nom text not null,
  adresse text,
  code_postal text,
  ville text,
  siren text,
  tel text,
  email text,
  contact text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists expertise_assurances_owner_idx on expertise_assurances (owner_id, nom);

create table if not exists expertise_clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  nom text not null,
  type text not null default 'particulier', -- particulier | societe
  adresse text,
  code_postal text,
  ville text,
  siren text,
  tel text,
  email text,
  contact text,
  notes text,
  created_at timestamptz default now()
);
create index if not exists expertise_clients_owner_idx on expertise_clients (owner_id, nom);

do $$
declare
  t text;
begin
  foreach t in array array['expertise_assurances','expertise_clients'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;
