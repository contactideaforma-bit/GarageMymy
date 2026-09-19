-- ============================================================
--  MIGRATION v79 — CRÉATION DES BUCKETS STORAGE MANQUANTS
--
--  Symptôme : à l'enregistrement du profil (logo, modèle de facture,
--  RIB ou signature), l'appli renvoie « Bucket not found ».
--
--  Cause : les buckets 'entreprise' et 'rapports' n'étaient créés que
--  par schema.sql / migration_profil_clients.sql, fichiers VIDÉS en
--  v6.3 (audit C2). Sur un nouvel environnement, ou si un bucket a été
--  supprimé, aucune migration active ne les recrée. Les policies v44
--  (cloisonnement <owner_id>/…) supposent pourtant qu'ils existent.
--
--  Cette migration recrée les 4 buckets de l'appli, sans toucher aux
--  fichiers ni aux policies déjà en place. Idempotente.
--    · entreprise : PUBLIC (logo / modèle de facture affichés dans les
--                   PDF et pages publiques), écriture cloisonnée (v44)
--    · rapports, pieces, prive : PRIVÉS (liens signés, v17 / v33 / v44)
--
--  À coller dans Supabase > SQL Editor puis Run.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('entreprise', 'entreprise', true)
on conflict (id) do update set public = true;

insert into storage.buckets (id, name, public)
values ('rapports', 'rapports', false),
       ('pieces',   'pieces',   false),
       ('prive',    'prive',    false)
on conflict (id) do update set public = false;

-- Lecture publique du bucket 'entreprise' (getPublicUrl côté appli).
-- L'écriture reste réservée au dossier du garage connecté (policies v44).
drop policy if exists entreprise_select_public on storage.objects;
create policy entreprise_select_public on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'entreprise');

-- Sécurité : si la v44 n'a pas encore été jouée sur cet environnement,
-- on pose au minimum la policy de dépôt cloisonné sur 'entreprise'.
drop policy if exists entreprise_insert_owner on storage.objects;
create policy entreprise_insert_owner on storage.objects
  for insert to authenticated
  with check (bucket_id = 'entreprise' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists entreprise_update_owner on storage.objects;
create policy entreprise_update_owner on storage.objects
  for update to authenticated
  using (
    bucket_id = 'entreprise'
    and ((storage.foldername(name))[1] = auth.uid()::text or owner = auth.uid())
  );

-- ============================================================
--  VÉRIFICATION : select id, public from storage.buckets order by id;
--  Attendu : entreprise=true, pieces=false, prive=false, rapports=false.
-- ============================================================
