-- ============================================================
--  My Easy Auto — Migration v40
--
--  1) TVA DU DOSSIER : le montant retenu au rapport est un montant HT.
--     Pour l'afficher AUSSI en TTC (liste des sinistres, fiche dossier,
--     tableau de bord), on mémorise le taux de TVA sur le dossier —
--     rempli automatiquement par l'analyse du rapport, modifiable à la main.
--
--  2) MÉMOIRE DE L'ANALYSE (« l'IA apprend ») :
--       - ia_corrections : JOURNAL. Chaque écart entre ce que l'IA a produit
--         et ce que le garage a finalement validé sur un devis/une facture.
--       - ia_regles      : les RÈGLES retenues. Une correction répétée
--         (2 fois) devient une règle ; le garage peut aussi en écrire à la
--         main. Les règles actives sont injectées dans le prompt d'analyse
--         ET appliquées automatiquement aux lignes extraites (libellé et
--         tableau d'affectation uniquement — jamais les montants).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1) TVA du dossier ----------
alter table public.dossiers add column if not exists tva numeric not null default 20;

-- Dossiers antérieurs : taux normal par défaut (aucune donnée à saisir).
update public.dossiers set tva = 20 where tva is null;

-- ---------- 2) Journal des corrections ----------
create table if not exists public.ia_corrections (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  dossier_id uuid references public.dossiers(id) on delete cascade,
  document_id uuid,
  -- libelle | categorie | taux | ignorer
  type text not null,
  -- clé normalisée de la désignation d'origine (minuscules, sans accents)
  cle text not null,
  -- valeur validée par le garage ('' quand la correction est une suppression)
  valeur text not null default '',
  -- trace lisible « avant → après » (affichée dans la mémoire de l'analyse)
  exemple text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists ia_corrections_owner_idx on public.ia_corrections(owner_id);
create index if not exists ia_corrections_cle_idx on public.ia_corrections(owner_id, type, cle);

alter table public.ia_corrections enable row level security;
drop policy if exists ia_corrections_owner on public.ia_corrections;
create policy ia_corrections_owner on public.ia_corrections
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- 3) Règles apprises ----------
create table if not exists public.ia_regles (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- libelle   : écrire « valeur » à la place de la désignation « cle »
  -- categorie : ranger « cle » dans le tableau « valeur » (piece|mo|autre)
  -- taux      : taux horaire habituel de « cle » (indication pour l'IA)
  -- ignorer   : ne pas extraire la ligne « cle »
  -- consigne  : consigne libre écrite par le garage (texte dans « valeur »)
  type text not null,
  cle text not null,
  valeur text not null default '',
  -- auto (déduite des corrections) | manuel (écrite par le garage)
  source text not null default 'auto',
  occurrences integer not null default 1,
  actif boolean not null default true,
  exemple text,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade
);

-- Une seule règle par (garage, type, clé).
create unique index if not exists ia_regles_owner_type_cle_uniq
  on public.ia_regles(owner_id, type, cle);
create index if not exists ia_regles_owner_idx on public.ia_regles(owner_id);

alter table public.ia_regles enable row level security;
drop policy if exists ia_regles_owner on public.ia_regles;
create policy ia_regles_owner on public.ia_regles
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
