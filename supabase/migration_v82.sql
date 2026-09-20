-- ============================================================
--  MIGRATION v82 — RETARD DE PAIEMENT ASSISTÉ (v13.12)
--
--  Chaque étape de la procédure de recouvrement devient une action guidée
--  par l'appli (et non plus un simple guide) :
--    · dossiers.retard_etapes : ce qui a été fait, quand, avec quelle
--      référence (n° de recommandé, date de saisine du conciliateur,
--      n° de requête, avocat saisi, date du titre exécutoire…)
--    · nouvelle étape « avocat » : si la voie sans avocat (injonction /
--      petites créances) n'aboutit pas, le dossier est transmis à un avocat
--    · courriers_recouvrement : nouveaux types de courriers générés
--      (saisine du conciliateur, réclamation à l'assureur, lettre
--      d'accompagnement de la requête en injonction, remise au commissaire
--      de justice), destinataire « tiers » et n° de suivi du recommandé.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================
alter table public.dossiers
  add column if not exists retard_etapes jsonb not null default '{}'::jsonb;

alter table public.courriers_recouvrement
  add column if not exists numero_suivi text;   -- n° du recommandé / de suivi postal

comment on column public.courriers_recouvrement.type is
  'relance | mise_en_demeure | saisine_conciliateur | reclamation_assureur | requete_injonction | transmission_avocat | remise_commissaire';
comment on column public.courriers_recouvrement.destinataire is 'client | assurance | tiers';
