-- Migration v27 : métier du garage (carrosserie ou vitrage)
-- Chaque compte (garage) est SOIT carrosserie SOIT vitrage. Le métier est
-- porté par le profil entreprise (une ligne par compte, cloisonnée par owner_id).
-- À la connexion, l'appli lit ce champ pour adapter le vocabulaire et le parcours.
-- Idempotent : réexécutable sans risque.

alter table if exists public.entreprise
  add column if not exists metier text not null default 'carrosserie';

-- Contrôle des valeurs autorisées (ajouté seulement s'il n'existe pas déjà).
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'entreprise_metier_check'
  ) then
    alter table public.entreprise
      add constraint entreprise_metier_check
      check (metier in ('carrosserie', 'vitrage'));
  end if;
end $$;
