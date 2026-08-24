-- ============================================================
--  My Easy Auto — Migration v44
--
--  CLOISONNEMENT DU STOCKAGE PAR GARAGE.
--
--  Jusqu'ici les policies Storage disaient « tout utilisateur CONNECTÉ
--  peut lire ce bucket ». Concrètement : un garage B, en devinant un nom
--  de fichier, pouvait télécharger le rapport d'expertise ou la carte
--  grise d'un client du garage A. C'était le dernier risque connu de
--  l'audit (docs/AUDIT-SECURITE.md).
--
--  Nouvelle règle : chaque fichier vit dans un dossier au nom du compte
--  (`<owner_id>/…`, posé par `deposerFichier()` côté application) et les
--  policies n'autorisent QUE ce dossier.
--
--  ⚠️ COMPATIBILITÉ : les fichiers déposés AVANT cette migration sont à la
--  racine du bucket. Les policies acceptent donc aussi les objets dont le
--  PROPRIÉTAIRE Storage (colonne `owner`, renseignée par Supabase à
--  l'upload) est le compte connecté. Rien n'est perdu, et un garage ne
--  voit toujours que ses propres fichiers.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
--  Prérequis : v14 (pieces), v17 (buckets privés), v33 (bucket prive).
-- ============================================================

-- ---------- 0. Les buckets sensibles restent privés ----------
update storage.buckets set public = false where id in ('rapports', 'pieces', 'prive');

-- ---------- 1. Anciennes policies « tout connecté » ----------
drop policy if exists rapports_insert_auth on storage.objects;
drop policy if exists rapports_select_auth on storage.objects;
drop policy if exists rapports_update_auth on storage.objects;
drop policy if exists rapports_delete_auth on storage.objects;
drop policy if exists pieces_insert_auth on storage.objects;
drop policy if exists pieces_select_auth on storage.objects;
drop policy if exists pieces_update_auth on storage.objects;
drop policy if exists pieces_delete_auth on storage.objects;
drop policy if exists prive_insert_auth on storage.objects;
drop policy if exists prive_select_auth on storage.objects;
drop policy if exists prive_update_auth on storage.objects;
drop policy if exists prive_delete_auth on storage.objects;
drop policy if exists entreprise_insert_auth on storage.objects;
drop policy if exists entreprise_update_auth on storage.objects;
drop policy if exists entreprise_delete_auth on storage.objects;

-- ---------- 2. Nouvelles policies, un bucket à la fois ----------
--  · lecture / modification / suppression : mon dossier OU mes anciens fichiers
--  · dépôt : UNIQUEMENT dans mon dossier (impossible de revenir en arrière)
do $$
declare
  b text;
  buckets text[] := array['rapports', 'pieces', 'prive'];
  lecture text := '(bucket_id = %L and ((storage.foldername(name))[1] = auth.uid()::text or owner = auth.uid()))';
  depot   text := '(bucket_id = %L and (storage.foldername(name))[1] = auth.uid()::text)';
begin
  foreach b in array buckets loop
    execute format('drop policy if exists %I on storage.objects', b || '_select_owner');
    execute format(
      'create policy %I on storage.objects for select to authenticated using ' || lecture,
      b || '_select_owner', b
    );

    execute format('drop policy if exists %I on storage.objects', b || '_insert_owner');
    execute format(
      'create policy %I on storage.objects for insert to authenticated with check ' || depot,
      b || '_insert_owner', b
    );

    execute format('drop policy if exists %I on storage.objects', b || '_update_owner');
    execute format(
      'create policy %I on storage.objects for update to authenticated using ' || lecture ||
      ' with check ' || lecture,
      b || '_update_owner', b, b
    );

    execute format('drop policy if exists %I on storage.objects', b || '_delete_owner');
    execute format(
      'create policy %I on storage.objects for delete to authenticated using ' || lecture,
      b || '_delete_owner', b
    );
  end loop;
end $$;

-- ---------- 3. Bucket « entreprise » (logo, modèle de facture) ----------
--  Il reste PUBLIC en lecture : le logo doit s'afficher dans les PDF et
--  sur les pages publiques. En revanche, on n'écrit que chez soi.
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

drop policy if exists entreprise_delete_owner on storage.objects;
create policy entreprise_delete_owner on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'entreprise'
    and ((storage.foldername(name))[1] = auth.uid()::text or owner = auth.uid())
  );

-- ============================================================
--  VÉRIFICATION rapide après exécution (facultatif) :
--    select name, owner from storage.objects where bucket_id = 'rapports' limit 20;
--  Les nouveaux dépôts doivent commencer par « <uuid du compte>/ ».
-- ============================================================
