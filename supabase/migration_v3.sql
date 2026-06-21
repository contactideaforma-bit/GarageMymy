-- ============================================================
--  GarageMYMY — Migration v3
--  Rendez-vous dans l'agenda (catégorie + interlocuteur).
--  À coller dans Supabase > SQL Editor puis exécuter (Run).
-- ============================================================

alter table public.evenements add column if not exists categorie text;   -- rdv_client | rdv_expert | autre
alter table public.evenements add column if not exists avec_qui text;     -- nom de l'interlocuteur
