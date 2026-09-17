-- ============================================================
--  My Easy Auto — Migration v73 (v13.1)
--
--  ATTRIBUTION DES PROSPECTS PAR L'ÉDITEUR
--
--  L'éditeur cherche des garages dans l'annuaire des entreprises (zone,
--  SIRET, nom), en sélectionne un lot et l'ATTRIBUE à un commercial : chaque
--  garage devient une fiche `prospects` dont le propriétaire (owner_id) est
--  le compte du commercial — elle apparaît donc directement dans « Mes
--  clients » et dans sa session d'appels.
--
--  On garde la trace de l'attribution (qui, quand, d'où vient la fiche) pour
--  le suivi éditeur et en cas de litige de portefeuille (contrat d'apporteur,
--  art. 3).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v57 (prospects), v71 (journal des contacts).
-- ============================================================

alter table public.prospects add column if not exists attribue_par uuid references auth.users(id) on delete set null;
alter table public.prospects add column if not exists attribue_le  timestamptz;
alter table public.prospects add column if not exists source       text; -- 'annuaire' = trouvé par l'éditeur dans l'annuaire des entreprises ; null = créé à la main

-- Recherche de doublons à l'attribution (un même établissement ne doit pas
-- être donné à deux commerciaux).
create index if not exists prospects_siret_idx on public.prospects (siret) where siret is not null;
create index if not exists prospects_siren_idx on public.prospects (siren) where siren is not null;
create index if not exists prospects_cp_idx    on public.prospects (cp);

comment on column public.prospects.attribue_par is 'Compte éditeur qui a attribué ce garage au commercial (null = fiche créée par le commercial lui-même).';
