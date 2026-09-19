-- ============================================================
--  MIGRATION v77 — MODE EXPERT : profil expert + agenda des visites (v13.7)
--  · expertise_experts : UN profil par session connectée (nom, agrément,
--    coordonnées, signature) — le PV est signé au nom de l'expert connecté.
--    À terme, chaque expert du cabinet aura son compte.
--  · expertise_rdv : rendez-vous d'expertise (visite chez le réparateur,
--    contradictoire, contrôle…) liés à un dossier et à un garage.
-- ============================================================

create table if not exists expertise_experts (
  owner_id uuid primary key default auth.uid(),
  nom text,
  prenom text,
  numero_agrement text,
  fonction text default 'Expert automobile',
  tel text,
  email text,
  signature_path text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists expertise_rdv (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid references expertise_dossiers (id) on delete set null,
  garage_id uuid references expertise_garages (id) on delete set null,
  date date not null,
  heure time,
  duree_min integer default 45,
  type text not null default 'visite',
  lieu text,
  adresse text,
  notes text,
  statut text not null default 'planifie',
  created_at timestamptz default now()
);
create index if not exists expertise_rdv_owner_date_idx on expertise_rdv (owner_id, date, heure);
create index if not exists expertise_rdv_dossier_idx on expertise_rdv (dossier_id);

do $$
declare
  t text;
begin
  foreach t in array array['expertise_experts','expertise_rdv'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists %I on %I', t || '_owner', t);
    execute format(
      'create policy %I on %I for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;
