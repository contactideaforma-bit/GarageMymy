-- ============================================================
--  My Easy Auto — Migration v41
--
--  RAPPELS (table `ardoise`) — le tableau de bord ne montre plus DEUX
--  listes redondantes (« Ardoise » + « À faire aujourd'hui ») mais UN
--  seul bloc « À faire », qui mélange :
--    · les rappels AUTOMATIQUES (calculés depuis les dossiers) ;
--    · les rappels ÉCRITS par le garage (l'ancienne ardoise).
--
--  Un rappel écrit peut désormais :
--    · être RATTACHÉ à un dossier (recherche depuis le tableau de bord,
--      ou création directe depuis la fiche du dossier) ;
--    · porter une ÉCHÉANCE, qui crée un vrai rendez-vous dans l'agenda
--      (table `evenements`, catégorie « rappel »).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- Dossier rattaché : supprimer le dossier supprime ses rappels.
alter table public.ardoise
  add column if not exists dossier_id uuid references public.dossiers(id) on delete cascade;

-- Échéance du rappel (null = simple pense-bête sans date).
alter table public.ardoise
  add column if not exists echeance timestamptz;

-- Rendez-vous d'agenda créé pour cette échéance. `on delete set null` :
-- si le RDV est supprimé depuis l'agenda, le rappel survit sans date.
alter table public.ardoise
  add column if not exists evenement_id uuid references public.evenements(id) on delete set null;

create index if not exists ardoise_dossier_idx on public.ardoise(owner_id, dossier_id);
create index if not exists ardoise_echeance_idx on public.ardoise(owner_id, echeance);
