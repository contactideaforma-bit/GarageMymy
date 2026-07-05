-- ============================================================
--  My Easy Auto — Migration v20
--  1. Téléphone du client sur le dossier.
--  2. Signature électronique sur les FACTURES/devis (documents) :
--     signataire, image de signature, date.
--  3. Signature À DISTANCE : jeton public unique (sign_token) sur
--     l'ordre de réparation, la cession de créance et les documents —
--     le client reçoit un lien /signer/<jeton> et signe depuis chez lui
--     (accès par jeton via le serveur, jamais par la base directement).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

-- 1) Téléphone client
alter table public.dossiers
  add column if not exists client_tel text;

-- 2) Signature sur les documents (devis / factures)
alter table public.documents
  add column if not exists signataire_nom text,
  add column if not exists signature text,
  add column if not exists signe_le timestamptz;

-- 3) Jetons de signature à distance
alter table public.documents
  add column if not exists sign_token uuid default gen_random_uuid();
alter table public.ordres_reparation
  add column if not exists sign_token uuid default gen_random_uuid();
alter table public.cessions_creance
  add column if not exists sign_token uuid default gen_random_uuid();

update public.documents set sign_token = gen_random_uuid() where sign_token is null;
update public.ordres_reparation set sign_token = gen_random_uuid() where sign_token is null;
update public.cessions_creance set sign_token = gen_random_uuid() where sign_token is null;

create unique index if not exists documents_sign_token_uniq on public.documents(sign_token);
create unique index if not exists ordres_reparation_sign_token_uniq on public.ordres_reparation(sign_token);
create unique index if not exists cessions_creance_sign_token_uniq on public.cessions_creance(sign_token);
