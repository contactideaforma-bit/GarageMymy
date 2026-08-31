-- ============================================================
--  My Easy Auto — Migration v62 (v11.3)
--
--  1. PROFIL DE PRESTATION DE LA SECRÉTAIRE
--     Questionnaire rempli AVEC la collaboratrice au moment d'éditer
--     son contrat (session éditeur) : coordonnées déjà sur la fiche,
--     puis périmètre des tâches convenues, moyens dont ELLE dispose,
--     limites et contraintes qu'elle pose, régime social/fiscal et
--     taux horaire négocié. Stocké en jsonb pour rester souple.
--
--  2. AVENANTS D'AFFECTATION
--     Chaque garage affecté (ou désaffecté) donne lieu à un avenant
--     signé : on élargit les contraintes de collaborateur_documents.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.collaborateurs
  add column if not exists profil_prestation jsonb;

-- Élargissement des modèles de document : + avenant d'affectation.
alter table public.collaborateur_documents
  drop constraint if exists collaborateur_documents_modele_check;
alter table public.collaborateur_documents
  add constraint collaborateur_documents_modele_check
  check (modele in ('apporteur','prestation','avenant'));

alter table public.collaborateur_documents
  drop constraint if exists collaborateur_documents_type_check;
alter table public.collaborateur_documents
  add constraint collaborateur_documents_type_check
  check (type in ('contrat','avenant'));

-- Garage concerné par un avenant d'affectation (libellé libre : le
-- garage peut ne pas encore exister en base au moment de la signature).
alter table public.collaborateur_documents
  add column if not exists garage_libelle text;
