-- ============================================================
--  MIGRATION v95 — v13.38 : CONNEXION QONTO EN OAUTH 2.0
--  Qonto exige OAuth2 (et non la clé API) pour les liens de paiement.
--  Une seule ligne (id = 1) : jetons de la connexion IDEAFORMA ↔ Qonto.
--  Le jeton d'accès vit 1 h, le jeton de renouvellement 90 jours et ne
--  sert qu'UNE fois : il est remplacé à chaque renouvellement.
--  RLS activée SANS politique : lecture/écriture par la clé service
--  uniquement (routes /api/qonto/*). Idempotent.
-- ============================================================

create table if not exists public.qonto_oauth (
  id             integer primary key default 1 check (id = 1),
  access_token   text,
  refresh_token  text,
  expires_at     timestamptz,
  scope          text,
  environnement  text,                 -- production | sandbox
  connecte_par   text,                 -- email de l'éditeur
  connecte_le    timestamptz,
  maj_le         timestamptz not null default now(),
  etat_attendu   text,                 -- « state » anti-CSRF de la connexion en cours
  etat_le        timestamptz,
  derniere_erreur text
);

alter table public.qonto_oauth enable row level security;
