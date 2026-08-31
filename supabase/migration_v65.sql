-- ============================================================
--  My Easy Auto — Migration v65 (v11.7)
--
--  ACCEPTATION DES CGU À LA VENTE.
--  Jusqu'ici, seules les CONDITIONS GÉNÉRALES DE VENTE étaient
--  acceptées et signées sur /vente. Or ce sont les CONDITIONS
--  GÉNÉRALES D'UTILISATION qui encadrent l'usage de l'application :
--  sécurité des identifiants, valeur de la signature électronique,
--  rôle de l'IA, propriété, disponibilité. Elles doivent être
--  acceptées elles aussi (audit juridique du 31/08/2026, §6.5).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.ventes add column if not exists cgu_acceptees boolean not null default false;
alter table public.ventes add column if not exists version_cgu text;
