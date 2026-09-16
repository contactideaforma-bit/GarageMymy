-- ============================================================
--  My Easy Auto — Migration v71 (v12.9)
--
--  SUIVI DU DÉMARCHAGE COMMERCIAL
--
--  1. prospect_interactions : le JOURNAL des contacts du commercial avec un
--     garage (appel, SMS, email, visite, note) et le RÉSULTAT de chaque
--     contact (pas de réponse, à rappeler, RDV pris, refus + motif…).
--     → « je l'ai déjà appelé ? », « qu'est-ce qu'il a dit ? », « pourquoi
--       il a dit non ? » : tout est là, daté.
--  2. prospects : compteurs dérivés du journal (nombre d'appels, dernier
--     contact) + motif de refus structuré pour les statistiques.
--
--  RLS : même règle que prospects (chaque commercial ne voit que les siens).
-- ============================================================

create table if not exists public.prospect_interactions (
  id             uuid primary key default gen_random_uuid(),
  created_at     timestamptz not null default now(),
  owner_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  prospect_id    uuid not null references public.prospects(id) on delete cascade,
  canal          text not null default 'appel' check (canal in ('appel','sms','email','visite','note')),
  resultat       text not null default 'autre' check (resultat in ('pas_repondu','messagerie','rappeler','interesse','rdv','refus','injoignable','autre')),
  motif_refus    text,             -- clé de MOTIFS_REFUS (lib/prospects.ts)
  commentaire    text,
  prochaine_date date,             -- rappel programmé à l'issue du contact
  rdv_le         timestamptz       -- date/heure du RDV pris
);
alter table public.prospect_interactions enable row level security;
drop policy if exists prospect_interactions_own on public.prospect_interactions;
create policy prospect_interactions_own on public.prospect_interactions
  for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create index if not exists prospect_interactions_prospect_idx on public.prospect_interactions (prospect_id, created_at desc);
create index if not exists prospect_interactions_owner_idx on public.prospect_interactions (owner_id, created_at desc);

alter table public.prospects add column if not exists nb_appels          integer not null default 0;
alter table public.prospects add column if not exists dernier_contact    timestamptz;
alter table public.prospects add column if not exists dernier_resultat   text;
alter table public.prospects add column if not exists motif_refus        text;
alter table public.prospects add column if not exists motif_refus_detail text;
alter table public.prospects add column if not exists rdv_le             timestamptz;
create index if not exists prospects_rappel_idx on public.prospects (owner_id, prochaine_date);
