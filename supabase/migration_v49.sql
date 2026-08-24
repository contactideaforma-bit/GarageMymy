-- ============================================================
--  My Easy Auto — Migration v49
--
--  RENTABILITÉ PAR DOSSIER.
--
--  Un carrossier sait ce qu'il facture ; presque aucun ne sait ce que
--  chaque dossier lui RAPPORTE. Trois informations manquaient :
--
--    · le coût horaire réel de l'atelier (salaires + charges + locaux) ;
--    · les heures RÉELLEMENT passées sur le véhicule ;
--    · le coût d'achat des pièces quand il n'y a pas de commande saisie.
--
--  Avec ça, l'appli calcule la marge de chaque dossier et met en évidence
--  l'écart entre heures vendues et heures passées — la fuite la plus
--  fréquente en carrosserie.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- Coût horaire de l'atelier, charges comprises (≠ taux horaire facturé).
alter table public.entreprise
  add column if not exists cout_horaire numeric;

-- Heures réellement passées sur le dossier (saisie rapide par le chef d'atelier).
alter table public.dossiers
  add column if not exists heures_passees numeric;

-- Coût d'achat réel des pièces, quand aucune commande n'est saisie.
alter table public.dossiers
  add column if not exists cout_pieces_reel numeric;
