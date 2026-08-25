-- ============================================================
--  My Easy Auto — Migration v53
--
--  ESPACE ÉDITEUR (/admin) — réservé aux comptes ADMIN_EMAILS.
--  Gestion des collaborateurs (commerciaux, secrétaires), des
--  abonnements des garages, des relevés de commissions / rétrocessions,
--  des règlements et des demandes. Paramètres du simulateur.
--
--  SÉCURITÉ : toutes ces tables ont la RLS ACTIVÉE SANS AUCUNE POLITIQUE.
--  Elles sont donc invisibles depuis le navigateur (comptes garage
--  compris) ; seules les routes /api/admin/* (clé service role, après
--  contrôle de ADMIN_EMAILS) y accèdent.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- 1. Paramètres (grille de prix, commissions, rétrocession, coûts) — JSON
create table if not exists public.admin_parametres (
  cle        text primary key,
  valeur     jsonb not null,
  maj_le     timestamptz not null default now()
);
alter table public.admin_parametres enable row level security;

-- 2. Collaborateurs : commerciaux (apporteurs d'affaires) et secrétaires
create table if not exists public.collaborateurs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  type               text not null check (type in ('commercial','secretaire')),
  nom                text not null,
  prenom             text,
  email              text,
  tel                text,
  siret              text,
  adresse            text,
  statut             text not null default 'actif' check (statut in ('actif','pause','termine')),
  date_debut         date,
  date_fin           date,
  iban               text,
  taux_retrocession  numeric,          -- secrétaires : part du CA secrétariat HT (0.65 par défaut)
  notes              text
);
alter table public.collaborateurs enable row level security;

-- 3. Abonnements des garages (ce que facture IDEAFORMA)
create table if not exists public.abonnements (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  garage_nom       text not null,
  garage_email     text,
  garage_owner_id  uuid,               -- compte My Easy Auto du garage (facultatif)
  formule          text not null check (formule in ('essentiel','starter','confort','serenite')),
  prix_ht          numeric not null,   -- mensualité HT réellement facturée (remise déduite)
  remise_pct       numeric not null default 0, -- remise accordée par le commercial, en %
  periodicite      text not null default 'mensuel' check (periodicite in ('mensuel','annuel')),
  montant_annuel   numeric,            -- forfait annuel payé en une fois (prix_ht = montant_annuel / 12)
  heures           integer not null default 0,
  date_signature   date not null,
  date_debut       date not null,      -- 1re mensualité
  engagement_12    boolean not null default false,
  statut           text not null default 'actif' check (statut in ('actif','suspendu','resilie')),
  date_fin         date,
  commercial_id    uuid references public.collaborateurs(id) on delete set null,
  secretaire_id    uuid references public.collaborateurs(id) on delete set null,
  notes            text
);
alter table public.abonnements enable row level security;
alter table public.abonnements add column if not exists remise_pct numeric not null default 0;
alter table public.abonnements add column if not exists periodicite text not null default 'mensuel';
alter table public.abonnements add column if not exists montant_annuel numeric;
create index if not exists abonnements_commercial_idx on public.abonnements (commercial_id);
create index if not exists abonnements_secretaire_idx on public.abonnements (secretaire_id);

-- 4. Mensualités : une ligne par mois facturé au garage (pointage des encaissements)
create table if not exists public.abonnement_mensualites (
  id              uuid primary key default gen_random_uuid(),
  abonnement_id   uuid not null references public.abonnements(id) on delete cascade,
  periode         date not null,      -- 1er jour du mois
  montant_ht      numeric not null,
  payee_le        date,               -- null = pas encore encaissée
  heures_faites   numeric,            -- heures réellement réalisées par la secrétaire
  notes           text,
  unique (abonnement_id, periode)
);
alter table public.abonnement_mensualites enable row level security;

-- 5. Règlements dus / payés aux collaborateurs (relevés)
create table if not exists public.collaborateur_reglements (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  collaborateur_id  uuid not null references public.collaborateurs(id) on delete cascade,
  abonnement_id     uuid references public.abonnements(id) on delete set null,
  cle               text unique,      -- idempotence des lignes générées (ex. sig:<abonnement>)
  type              text not null check (type in ('commission','fidelite','bonus','retrocession','reprise','autre')),
  libelle           text not null,
  periode           date,             -- mois concerné
  montant           numeric not null, -- négatif = reprise
  statut            text not null default 'a_payer' check (statut in ('a_payer','paye','annule')),
  paye_le           date,
  facture_ref       text,
  notes             text
);
alter table public.collaborateur_reglements enable row level security;
create index if not exists collab_reglements_collab_idx on public.collaborateur_reglements (collaborateur_id, statut);

-- 6. Demandes des collaborateurs (suivies par l'éditeur)
create table if not exists public.collaborateur_demandes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  collaborateur_id  uuid not null references public.collaborateurs(id) on delete cascade,
  objet             text not null,
  contenu           text,
  statut            text not null default 'ouverte' check (statut in ('ouverte','en_cours','close')),
  reponse           text,
  repondu_le        timestamptz
);
alter table public.collaborateur_demandes enable row level security;
