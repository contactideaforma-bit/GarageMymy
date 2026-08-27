-- ============================================================
--  My Easy Auto — Migration v55 (v10.0)
--  DÉCLARATION DES VENTES par les commerciaux + suivi de fidélisation.
--
--  Le commercial ne peut pas créer de compte : il DÉCLARE sa vente depuis
--  la page publique /vente avec son CODE APPORTEUR (fiche de renseignement,
--  forfait, mode de paiement, contrat signé sur place). L'éditeur valide
--  dans /admin/ventes, crée le compte, rattache l'abonnement et suit la
--  fidélisation (mensualités encaissées).
--
--  SÉCURITÉ : RLS activée SANS politique (invisible du navigateur) ;
--  écriture uniquement par /api/vente (service role, code vérifié),
--  lecture/modification par /api/admin/donnees.
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- 1. Code apporteur du commercial (à communiquer au commercial)
alter table public.collaborateurs add column if not exists code_apporteur text;
create unique index if not exists collaborateurs_code_apporteur_idx
  on public.collaborateurs (upper(code_apporteur)) where code_apporteur is not null;

-- 2. Ventes déclarées
create table if not exists public.ventes (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  numero             text,                          -- V-AAAAMM-xxxx
  code_apporteur     text not null,
  collaborateur_id   uuid references public.collaborateurs(id) on delete set null,
  -- garage
  garage_nom         text not null,
  garage_siret       text,
  garage_adresse     text,
  garage_cp          text,
  garage_ville       text,
  contact_nom        text,
  contact_fonction   text,
  contact_tel        text,
  contact_email      text not null,
  -- offre
  formule            text not null check (formule in ('essentiel','starter','confort','serenite')),
  engagement_12      boolean not null default false,
  periodicite        text not null default 'mensuel' check (periodicite in ('mensuel','annuel')),
  remise_supp_pct    numeric not null default 0,    -- remise exceptionnelle (validée par l'éditeur)
  prix_mensuel_ht    numeric not null,              -- mensualité HT convenue
  montant_annuel_ht  numeric,                       -- si paiement en une fois
  mise_en_service_ht numeric not null default 0,
  date_debut_souhaitee date,
  -- paiement sur place
  mode_paiement      text not null default 'virement' check (mode_paiement in ('virement','prelevement','cheque','especes','cb')),
  paiement_sur_place boolean not null default false,
  paiement_montant   numeric,
  paiement_reference text,
  -- fiche de renseignement (besoins du garage) — JSON libre
  besoins            jsonb,
  -- contrat d'engagement signé sur place
  cgv_acceptees      boolean not null default false,
  signataire_nom     text,
  signataire_qualite text,
  signature          text,                          -- dataURL PNG
  signe_le           timestamptz,
  -- suivi éditeur
  statut             text not null default 'declaree'
                     check (statut in ('declaree','validee','compte_cree','fidelisee','perdue','refusee')),
  abonnement_id      uuid references public.abonnements(id) on delete set null,
  validee_le         timestamptz,
  notes_admin        text,
  ip                 text,
  user_agent         text
);
alter table public.ventes enable row level security;
create index if not exists ventes_statut_idx on public.ventes (statut, created_at desc);
create index if not exists ventes_collab_idx on public.ventes (collaborateur_id);
