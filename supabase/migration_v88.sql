-- ============================================================
--  MIGRATION v88 — MODE EXPERT : CONTRÔLE ÉTENDU (v13.25)
--
--  · Contrôle de la FACTURE finale (même moteur que le devis) : type.
--  · Portail de réponse du garage : UN lien par demande (jeton unique),
--    réponse ligne par ligne stockée sur le contrôle.
--  · Relances : date de la dernière relance + compteur.
--  · Seuil VEI : valeur de remplacement / de sauvegarde sur le dossier.
--  · Réglages du cabinet : délai de relance, seuil d'alerte prix pièces,
--    seuil d'alerte VEI.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
--  Pré-requis : migration_v87.sql.
-- ============================================================

alter table expertise_controles add column if not exists type text not null default 'devis';   -- devis | facture
alter table expertise_controles add column if not exists lien_token text;
alter table expertise_controles add column if not exists lien_expire_le timestamptz;
alter table expertise_controles add column if not exists reponse_garage jsonb;
alter table expertise_controles add column if not exists derniere_relance timestamptz;
alter table expertise_controles add column if not exists nb_relances integer not null default 0;

create unique index if not exists expertise_controles_token_idx
  on expertise_controles (lien_token) where lien_token is not null;

alter table expertise_dossiers add column if not exists valeur_remplacement numeric;  -- VRADE TTC
alter table expertise_dossiers add column if not exists valeur_sauvegarde numeric;    -- valeur de l'épave

alter table expertise_cabinet add column if not exists delai_relance_jours integer default 5;
alter table expertise_cabinet add column if not exists seuil_prix_pieces numeric default 10;   -- % au-dessus du prix relevé
alter table expertise_cabinet add column if not exists seuil_vei numeric default 80;           -- % de la VRADE

-- Les photos envoyées par les garages vont dans le bucket privé « pieces »
-- (chemin <owner_id>/expertise/<dossier>/reponses/…), écrites par la route
-- serveur /api/reponse-garage (clé service) : aucune policy publique.

comment on column expertise_controles.lien_token is 'Jeton du lien UNIQUE de réponse du garage (v13.25).';
