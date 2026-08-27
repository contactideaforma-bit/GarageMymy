-- ============================================================
--  My Easy Auto — Migration v57 (v10.2)
--  ESPACE CLIENTS DU COMMERCIAL : prospects (fiche garage pré-remplie par
--  le SIREN + questionnaire), documents générés et signés sur place
--  (devis, contrat, simulation), vente et paiement. L'éditeur fait la même
--  chose depuis son compte et voit tous les portefeuilles.
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- 1. Le commercial a un COMPTE (app_metadata.metier = 'commercial') rattaché à sa fiche
alter table public.collaborateurs add column if not exists owner_id uuid references auth.users(id) on delete set null;
alter table public.collaborateurs add column if not exists zone text;          -- zone géographique attribuée (départements, villes…)
alter table public.collaborateurs add column if not exists portefeuille text;  -- description du portefeuille attribué
alter table public.collaborateurs add column if not exists signature text;     -- signature du commercial (dataURL) apposée sur les documents
create unique index if not exists collaborateurs_owner_idx on public.collaborateurs (owner_id) where owner_id is not null;

-- 2. Prospects / clients du commercial (RLS : chacun ne voit que les siens ; l'éditeur passe par le service role)
create table if not exists public.prospects (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  maj_le           timestamptz not null default now(),
  owner_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  -- identité (pré-remplie depuis l'annuaire des entreprises)
  siren            text,
  siret            text,
  nom              text not null,
  forme_juridique  text,
  activite         text,
  tva_intra        text,
  adresse          text,
  cp               text,
  ville            text,
  -- complétée à la main
  gerant           text,
  contact_nom      text,
  contact_fonction text,
  tel              text,
  email            text,
  site             text,
  effectif         integer,
  -- questionnaire (fiche de besoins), jamais bloquant, modifiable à tout moment
  besoins          jsonb,
  -- suivi
  statut           text not null default 'prospect' check (statut in ('prospect','rdv','devis','signe','client','perdu')),
  origine          text not null default 'portefeuille' check (origine in ('portefeuille','connaissance','recommandation','hors_zone','editeur')),
  origine_detail   text,            -- qui a recommandé / lien avec la connaissance (preuve en cas de litige)
  prochaine_action text,
  prochaine_date   date,
  notes            text
);
alter table public.prospects enable row level security;
drop policy if exists prospects_own on public.prospects;
create policy prospects_own on public.prospects
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists prospects_owner_idx on public.prospects (owner_id, statut);

-- 3. Documents générés pour un prospect (devis, contrat, simulation, fiche) + signatures + envoi
create table if not exists public.prospect_documents (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  owner_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospect_id           uuid not null references public.prospects(id) on delete cascade,
  type                  text not null check (type in ('devis','contrat','simulation','fiche')),
  numero                text,
  parametres            jsonb,          -- formule, engagement, périodicité, remise… (pour régénérer le PDF à l'identique)
  statut                text not null default 'brouillon' check (statut in ('brouillon','envoye','signe','accepte','refuse')),
  signature_client      text,
  signataire_client     text,
  signature_commercial  text,
  signe_le              timestamptz,
  envoye_le             timestamptz,
  envoye_a              text,
  notes                 text
);
alter table public.prospect_documents enable row level security;
drop policy if exists prospect_documents_own on public.prospect_documents;
create policy prospect_documents_own on public.prospect_documents
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists prospect_documents_prospect_idx on public.prospect_documents (prospect_id);

-- 4. Ventes : lien avec le prospect + demande et confirmation de paiement
alter table public.ventes add column if not exists prospect_id uuid references public.prospects(id) on delete set null;
alter table public.ventes add column if not exists owner_id uuid references auth.users(id) on delete set null; -- compte qui a déclaré (commercial ou éditeur)
alter table public.ventes add column if not exists paiement_demande text;        -- virement | cb
alter table public.ventes add column if not exists paiement_demande_le timestamptz;
alter table public.ventes add column if not exists paiement_confirme_le timestamptz; -- confirmé par le commercial
alter table public.ventes add column if not exists paiement_valide_le timestamptz;   -- vérifié par l'éditeur
-- Le commercial lit ses propres ventes (suivi) ; l'écriture reste côté serveur.
drop policy if exists ventes_select_own on public.ventes;
create policy ventes_select_own on public.ventes
  for select to authenticated using (owner_id = auth.uid());
