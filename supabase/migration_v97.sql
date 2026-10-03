-- ============================================================
--  MIGRATION v97 — v13.40 : DÉCLARATION DU GARAGE AUPRÈS DES EXPERTS
--  Email groupé (un envoi personnalisé par cabinet) annonçant un nouveau
--  réparateur : coordonnées, Kbis en pièce jointe, taux horaires HT
--  (T1, T2, T3, peinture, ingrédients peinture), assurance RC, agréments.
--  Idempotent.
-- ============================================================

-- Profil du garage : taux horaires HT et informations « réparateur »
alter table public.entreprise add column if not exists taux_t1 numeric;
alter table public.entreprise add column if not exists taux_t2 numeric;
alter table public.entreprise add column if not exists taux_t3 numeric;
alter table public.entreprise add column if not exists taux_peinture numeric;
alter table public.entreprise add column if not exists ingr_opaque numeric;        -- ingrédients peinture opaque (€ HT / h)
alter table public.entreprise add column if not exists ingr_metal_verni numeric;   -- métallisé / vernis (bicouche)
alter table public.entreprise add column if not exists ingr_nacre numeric;         -- nacré (tricouche)
alter table public.entreprise add column if not exists kbis_path text;             -- PDF dans le bucket PRIVÉ 'prive'
alter table public.entreprise add column if not exists kbis_date date;             -- date de l'extrait (moins de 3 mois conseillé)
alter table public.entreprise add column if not exists rc_assureur text;           -- assurance responsabilité civile professionnelle
alter table public.entreprise add column if not exists rc_police text;
alter table public.entreprise add column if not exists agrements text;             -- agréments / partenariats assureurs
alter table public.entreprise add column if not exists horaires text;
alter table public.entreprise add column if not exists services text;              -- véhicule de prêt, dépannage, marbre…

-- Annuaire experts : date du dernier envoi de la déclaration
alter table public.experts add column if not exists declaration_envoyee_le timestamptz;

-- Journal des campagnes (lecture par le garage, écriture par la route serveur)
create table if not exists public.declarations_experts (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  owner_id    uuid not null,
  sujet       text,
  envoyes     integer not null default 0,
  echecs      integer not null default 0,
  details     jsonb
);
create index if not exists declarations_experts_owner_idx on public.declarations_experts (owner_id, created_at desc);
alter table public.declarations_experts enable row level security;
drop policy if exists declarations_experts_lecture on public.declarations_experts;
create policy declarations_experts_lecture on public.declarations_experts
  for select to authenticated using (owner_id = auth.uid());
