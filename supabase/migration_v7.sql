-- ============================================================
--  GarageMYMY — Migration v7
--  Configuration SMTP du garage (envoi des emails depuis sa propre boîte).
--  ⚠️ Données SENSIBLES (mot de passe SMTP) : accès SERVEUR uniquement.
--  La table a RLS activée SANS policy => le client (clé anon/authenticated)
--  ne peut NI lire NI écrire. Seules les routes serveur, qui utilisent la
--  clé SERVICE ROLE (qui contourne RLS), y accèdent.
--  À coller dans Supabase > SQL Editor puis Run.
-- ============================================================

create table if not exists public.mail_config (
  id uuid primary key default gen_random_uuid(),
  updated_at timestamptz not null default now(),
  smtp_host text,
  smtp_port int not null default 587,
  smtp_secure boolean not null default false,  -- true = port 465 (SSL), false = 587 (STARTTLS)
  smtp_user text,
  smtp_pass text,                              -- secret : jamais renvoyé au navigateur
  from_name text,
  from_email text
);

-- RLS activée, AUCUNE policy : bloque tout accès via la clé publique.
alter table public.mail_config enable row level security;
-- (par sécurité, on retire d'éventuelles policies héritées)
drop policy if exists "mail_config_all_anon" on public.mail_config;
drop policy if exists "mail_config_all_auth" on public.mail_config;
