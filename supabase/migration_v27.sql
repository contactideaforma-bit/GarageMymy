-- Migration v27 : métier du compte (carrosserie OU vitrage) porté par l'AUTH.
--
-- Modèle : chaque compte est d'un seul métier, fixé À LA CRÉATION par l'admin,
-- et NON modifiable par l'utilisateur. Un compte carrosserie n'accède qu'à la
-- carrosserie, un compte vitrage qu'au vitrage — aucun lien entre les comptes.
--
-- Le métier est stocké dans `raw_app_meta_data` de auth.users (app_metadata) :
--   • lisible côté appli (user.app_metadata.metier),
--   • NON modifiable par le client (seul le service role / SQL peut l'écrire).
--
-- => Rien à créer dans le schéma public. Assigne le métier compte par compte
--    avec l'un des UPDATE ci-dessous (adapter l'email et 'carrosserie'/'vitrage').

-- Exemple : passer un compte en VITRAGE
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                           || jsonb_build_object('metier', 'vitrage')
--   where email = 'client-vitrage@example.com';

-- Exemple : passer un compte en CARROSSERIE (défaut si non renseigné)
-- update auth.users
--   set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
--                           || jsonb_build_object('metier', 'carrosserie')
--   where email = 'client-carrosserie@example.com';

-- Vérifier le métier de chaque compte
-- select email, raw_app_meta_data ->> 'metier' as metier from auth.users order by email;

-- NB : après l'UPDATE, le compte doit se reconnecter (ou rafraîchir sa session)
-- pour que le nouveau app_metadata soit pris en compte.
--
-- Un compte sans métier renseigné est traité comme 'carrosserie' par défaut.
--
-- (Si la version v4.9 précédente a déjà ajouté entreprise.metier, cette colonne
--  devient inutilisée — sans effet. La source de vérité est désormais l'Auth.)
