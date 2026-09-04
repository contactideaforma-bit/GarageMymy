-- ============================================================
--  My Easy Auto — Migration v68 (v12.4)
--
--  HEURES DE SECRÉTARIAT : PLUSIEURS DOSSIERS PAR LIGNE
--  La secrétaire justifie souvent un même créneau sur plusieurs dossiers
--  (« relancé l'expert pour AB-123-CD et CD-456-EF »). Jusqu'ici une
--  ligne ne pouvait pointer qu'UN dossier.
--
--  · dossier_ids : la liste complète des dossiers concernés.
--  · dossier_id  : conservé (= le premier de la liste) pour les écrans et
--    requêtes existants ; rien à réécrire.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.heures_secretariat
  add column if not exists dossier_ids uuid[] not null default '{}';

-- Reprise de l'existant : la ligne mono-dossier devient une liste d'un élément.
update public.heures_secretariat
   set dossier_ids = array[dossier_id]
 where dossier_id is not null
   and (dossier_ids is null or cardinality(dossier_ids) = 0);

create index if not exists heures_secretariat_dossier_ids_idx
  on public.heures_secretariat using gin (dossier_ids);
