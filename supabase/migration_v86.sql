-- ============================================================
--  MIGRATION v86 — ORDRE DE RÉPARATION ÉTOFFÉ (v13.22)
--
--  L'OR devient un vrai contrat : état du véhicule à la prise en charge,
--  choix des pièces, sort des pièces remplacées, conditions générales
--  figées (version) et acceptation des conditions à la signature à distance.
--  Idempotente : ré-exécutable sans risque.
-- ============================================================

alter table public.ordres_reparation
  add column if not exists kilometrage integer,
  add column if not exists carburant text,
  add column if not exists etat_entree text,
  add column if not exists objets_bord text,
  add column if not exists pieces_choix text,           -- neuves | equivalentes | reemploi
  add column if not exists pieces_restituees boolean,   -- le client veut récupérer les pièces remplacées
  add column if not exists conditions_version integer,  -- version des CG imprimées
  add column if not exists conditions_acceptees_le timestamptz;

comment on column public.ordres_reparation.etat_entree is 'État constaté à la prise en charge (v13.22).';
comment on column public.ordres_reparation.pieces_choix is 'neuves | equivalentes | reemploi (v13.22).';
comment on column public.ordres_reparation.conditions_version is 'Version des conditions générales imprimées sur l''OR (v13.22).';
