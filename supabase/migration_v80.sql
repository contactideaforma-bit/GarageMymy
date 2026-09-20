-- ============================================================
--  MIGRATION v80 — MODE EXPERT : numéro de mission JAMAIS en doublon
--
--  Symptôme : « duplicate key value violates unique constraint
--  "expertise_dossiers_numero_idx" » à la création d'une mission.
--
--  Cause : les dossiers de démonstration (AE00034914 → AE00034920) sont
--  insérés avec un numéro explicite, sans avancer le compteur du cabinet
--  (prochain_numero, défaut 34915). La fonction rendait donc un numéro
--  déjà utilisé.
--
--  1. expertise_prochain_numero() saute les numéros déjà pris par le
--     cabinet (boucle bornée), quelle que soit leur origine (démo, saisie
--     manuelle, import).
--  2. Remise à niveau : pour chaque cabinet, le compteur repart après le
--     plus grand numéro AE######## existant.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create or replace function expertise_prochain_numero()
returns text
language plpgsql
security definer
as $$
declare
  n integer;
  candidat text;
  essais integer := 0;
begin
  insert into expertise_cabinet (owner_id) values (auth.uid())
    on conflict (owner_id) do nothing;
  loop
    update expertise_cabinet
      set prochain_numero = prochain_numero + 1
      where owner_id = auth.uid()
      returning prochain_numero - 1 into n;
    candidat := 'AE' || lpad(n::text, 8, '0');
    exit when not exists (
      select 1 from expertise_dossiers where owner_id = auth.uid() and numero = candidat
    );
    essais := essais + 1;
    if essais > 10000 then
      raise exception 'expertise_prochain_numero : impossible de trouver un numéro libre';
    end if;
  end loop;
  return candidat;
end $$;

-- Remise à niveau des compteurs existants.
update expertise_cabinet c
set prochain_numero = greatest(
  c.prochain_numero,
  coalesce((
    select max(substring(d.numero from 3)::integer) + 1
    from expertise_dossiers d
    where d.owner_id = c.owner_id and d.numero ~ '^AE[0-9]{8}$'
  ), c.prochain_numero)
);
