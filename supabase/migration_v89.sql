-- ============================================================
--  MIGRATION v89 — COURRIERS LA POSTE DÉMATÉRIALISÉS (v13.27)
--
--  Envoi d'un PDF depuis l'appli : Maileva (groupe La Poste) imprime,
--  met sous pli et remet au facteur — lettre simple ou recommandé AR
--  papier (avis de réception scanné en option).
--
--  · maileva_config  : identifiants API du garage (secrets chiffrés
--                      côté serveur, jamais lus par le navigateur).
--  · envois_postaux  : journal de chaque envoi, suivi du statut,
--                      n° de recommandé, lien vers le dossier / le
--                      courrier de recouvrement d'origine.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists maileva_config (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique default auth.uid(),
  environnement text not null default 'sandbox',   -- sandbox | production
  login text,
  password text,                                   -- chiffré (lib/coffre)
  client_id text,
  client_secret text,                              -- chiffré (lib/coffre)
  notification_email text,
  couleur boolean not null default false,
  recto_verso boolean not null default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table maileva_config enable row level security;
-- Lue/écrite UNIQUEMENT par les routes serveur (clé service) : aucune
-- policy pour le navigateur, les secrets ne quittent jamais le serveur.
drop policy if exists maileva_config_owner on maileva_config;

create table if not exists envois_postaux (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid(),
  dossier_id uuid references dossiers (id) on delete set null,
  courrier_id uuid references courriers_recouvrement (id) on delete set null,
  type text not null default 'simple',             -- simple | lrar
  objet text,
  destinataire_nom text,
  adresse_lignes jsonb not null default '[]'::jsonb, -- 6 lignes normées (AFNOR)
  pays text not null default 'FR',
  couleur boolean not null default false,
  recto_verso boolean not null default true,
  ar_scanne boolean not null default false,
  pdf_path text,                                   -- bucket privé « pieces »
  environnement text not null default 'sandbox',
  maileva_sending_id text,
  maileva_recipient_id text,
  statut text not null default 'brouillon',        -- brouillon | soumis | en_production | poste | distribue | rejete | erreur
  statut_maileva text,
  numero_suivi text,                               -- n° du recommandé
  historique jsonb not null default '[]'::jsonb,   -- [{date, statut, detail}]
  erreur text,
  soumis_le timestamptz,
  maj_statut_le timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists envois_postaux_owner_idx on envois_postaux (owner_id, created_at desc);
create index if not exists envois_postaux_dossier_idx on envois_postaux (dossier_id);
create index if not exists envois_postaux_courrier_idx on envois_postaux (courrier_id);

alter table envois_postaux enable row level security;
-- Lecture par le garage connecté ; l'écriture passe par les routes serveur.
drop policy if exists envois_postaux_owner on envois_postaux;
create policy envois_postaux_owner on envois_postaux
  for select to authenticated
  using (owner_id = auth.uid());

comment on table envois_postaux is 'Courriers papier envoyés via Maileva (La Poste) depuis l''appli (v13.27).';
comment on table maileva_config is 'Identifiants API Maileva du garage — secrets chiffrés, lus par le serveur uniquement (v13.27).';
