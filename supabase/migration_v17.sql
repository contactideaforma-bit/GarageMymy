-- ============================================================
--  My Easy Auto — Migration v17 (AUDIT SÉCURITÉ)
--
--  1. mail_config PAR GARAGE : colonne owner_id (jusqu'ici la config
--     SMTP était GLOBALE : tous les garages auraient envoyé depuis la
--     même boîte). Les routes /api/mail-config et /api/send-email
--     utilisent désormais la config du garage CONNECTÉ.
--  2. Buckets 'rapports' et 'pieces' PRIVÉS : les rapports d'expertise
--     et cartes grises (données personnelles) ne sont plus accessibles
--     par simple URL publique — l'appli génère des liens signés (1 h)
--     réservés aux utilisateurs connectés. Le bucket 'entreprise'
--     (logo) reste public.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
--  Prérequis : v7 (mail_config), v14 (pieces). ≥1 compte dans Auth.
-- ============================================================

-- ---------- 1. mail_config par garage ----------
do $$
declare
  first_owner uuid;
begin
  select id into first_owner from auth.users order by created_at asc limit 1;

  alter table public.mail_config
    add column if not exists owner_id uuid references auth.users(id) on delete cascade;

  -- Rattache la config existante au 1er compte (le garage d'origine).
  if first_owner is not null then
    update public.mail_config set owner_id = first_owner where owner_id is null;
  end if;
end $$;

-- Une seule config par garage.
create unique index if not exists mail_config_owner_uniq
  on public.mail_config(owner_id) where owner_id is not null;

-- ---------- 2. Buckets privés ----------
update storage.buckets set public = false where id in ('rapports', 'pieces');

-- Lecture/écriture réservées aux utilisateurs connectés (liens signés côté app).
drop policy if exists rapports_insert_auth on storage.objects;
create policy rapports_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'rapports');

drop policy if exists rapports_select_auth on storage.objects;
create policy rapports_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'rapports');

drop policy if exists rapports_delete_auth on storage.objects;
create policy rapports_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'rapports');

-- (les policies équivalentes du bucket 'pieces' existent depuis la v14)

-- ============================================================
--  Reste connu (accepté pour l'instant, cf. docs/AUDIT-SECURITE.md) :
--   • Le cloisonnement du Storage PAR GARAGE (préfixe owner_id dans le
--     chemin) n'est pas encore appliqué : tout utilisateur CONNECTÉ
--     peut techniquement lire les objets des buckets via l'API.
--     À faire avant d'accueillir des garages « inconnus ».
-- ============================================================
