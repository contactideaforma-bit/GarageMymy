-- Migration v30 — ESPACES EXTRANET DES EXPERTS
-- Coffre des accès aux portails experts (BCA, Alliance, IDEA…) :
-- URL de l'espace, identifiant, mot de passe CHIFFRÉ côté serveur.
--
-- SÉCURITÉ (même modèle que mail_config) :
--   - RLS activée SANS policy → la table est INACCESSIBLE depuis le client.
--   - Tout passe par la route /api/extranets (clé SERVICE ROLE côté serveur),
--     qui vérifie le jeton de l'utilisateur et filtre par owner_id.
--   - Le mot de passe est stocké CHIFFRÉ (AES-256-GCM) : même un dump de la
--     base ne l'expose pas en clair.

create table if not exists acces_extranets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users (id) on delete cascade,
  nom text not null,                 -- ex. « BCA Expertise », « Alliance », « IDEA »
  url text,                          -- adresse de l'espace extranet
  identifiant text,                  -- login du garage sur le portail
  pass_chiffre text,                 -- mot de passe chiffré AES-256-GCM (jamais en clair)
  notes text,                        -- infos libres (n° de compte, contact, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists acces_extranets_owner_idx on acces_extranets (owner_id);

-- RLS SANS policy : aucun accès client direct (anon ou authenticated).
alter table acces_extranets enable row level security;
