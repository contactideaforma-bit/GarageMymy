-- ============================================================
--  My Easy Auto — Migration v19
--  EMAIL DU CLIENT sur le dossier : plus besoin de retrouver le
--  client dans l'annuaire pour lui écrire — l'email vit sur la
--  fiche du sinistre (relances, envois de devis/factures…).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

alter table public.dossiers
  add column if not exists client_email text;

-- Récupère l'email depuis l'annuaire Clients quand le nom correspond
-- (même garage), pour les dossiers existants.
update public.dossiers d
set client_email = c.email
from public.clients c
where d.client_email is null
  and c.email is not null
  and d.owner_id = c.owner_id
  and lower(trim(coalesce(d.client_nom, ''))) = lower(trim(coalesce(c.nom, '')))
  and d.client_nom is not null;
