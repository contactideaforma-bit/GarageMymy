-- ============================================================
--  My Easy Auto — Migration v70 (v12.7)
--
--  MODE « RETARD DE PAIEMENT » ASSISTÉ
--
--  1. dossiers : le dossier passe en retard de paiement (drapeau + date +
--     étape de la procédure atteinte). Comme le mode litige : on active,
--     on désactive, les traces restent.
--  2. relances : journal des CONTACTS (appel du client, de l'assurance…)
--     → on note QUI on a eu, QUAND et CE QUI A ÉTÉ DIT.
--  3. courriers_recouvrement : courriers de relance et mises en demeure
--     générés par l'appli — texte MODIFIABLE, signés, envoyés (email ou
--     courrier recommandé), conservés comme preuve pour la suite
--     (injonction de payer, commissaire de justice).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. Dossier en retard de paiement ----------
alter table public.dossiers
  add column if not exists retard_paiement boolean not null default false,
  add column if not exists retard_depuis   timestamptz,
  add column if not exists retard_etape    text;   -- amiable | mise_en_demeure | amiable_judiciaire | judiciaire | execution

create index if not exists dossiers_retard_idx on public.dossiers (owner_id) where retard_paiement;

-- ---------- 2. Journal des contacts ----------
alter table public.relances
  add column if not exists interlocuteur text,      -- client | assurance | expert | autre
  add column if not exists heure         text;      -- « 14:30 » (facultatif)

-- ---------- 3. Courriers de recouvrement ----------
create table if not exists public.courriers_recouvrement (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  dossier_id        uuid not null references public.dossiers(id) on delete cascade,
  document_id       uuid references public.documents(id) on delete set null,
  type              text not null,                  -- relance | mise_en_demeure
  destinataire      text not null default 'client', -- client | assurance
  destinataire_nom  text,
  destinataire_adresse text,
  objet             text,
  corps             text,
  montant           numeric,
  delai_jours       integer,
  date_courrier     date not null default current_date,
  signataire_nom    text,
  signature         text,                            -- dataURL PNG (facultatif)
  signe_le          timestamptz,
  envoye_le         timestamptz,
  canal_envoi       text,                            -- email | courrier | lrar | remis_en_main
  statut            text not null default 'brouillon', -- brouillon | signe | envoye
  notes             text,
  owner_id          uuid not null default auth.uid() references auth.users(id) on delete cascade
);

create index if not exists courriers_recouvrement_dossier_idx on public.courriers_recouvrement (dossier_id, created_at desc);
create index if not exists courriers_recouvrement_owner_idx on public.courriers_recouvrement (owner_id);

alter table public.courriers_recouvrement enable row level security;
drop policy if exists courriers_recouvrement_owner on public.courriers_recouvrement;
create policy courriers_recouvrement_owner on public.courriers_recouvrement
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Corbeille (v69) : les courriers supprimés restent restaurables 30 jours.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'corbeille_capture') then
    execute 'drop trigger if exists corbeille_courriers_recouvrement on public.courriers_recouvrement';
    execute 'create trigger corbeille_courriers_recouvrement before delete on public.courriers_recouvrement for each row execute function public.corbeille_capture()';
  end if;
end $$;

-- ---------- 4. Signature À DISTANCE des contrats de prêt / location ----------
-- Même mécanisme que les OR / cessions / devis (v20) : un jeton public unique
-- donne accès à la page /signer/<jeton>, servie par /api/signature.
alter table public.transferts_garantie
  add column if not exists sign_token uuid default gen_random_uuid();
alter table public.flotte_mises_a_dispo
  add column if not exists sign_token uuid default gen_random_uuid();
update public.transferts_garantie set sign_token = gen_random_uuid() where sign_token is null;
update public.flotte_mises_a_dispo set sign_token = gen_random_uuid() where sign_token is null;
create unique index if not exists transferts_garantie_sign_token_uniq on public.transferts_garantie(sign_token);
create unique index if not exists flotte_mises_a_dispo_sign_token_uniq on public.flotte_mises_a_dispo(sign_token);
