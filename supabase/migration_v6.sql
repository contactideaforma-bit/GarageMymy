-- ============================================================
--  GarageMYMY — Migration v6  (OPTIONNELLE — sécurité)
--  Restreint l'accès aux données aux utilisateurs AUTHENTIFIÉS.
--
--  ⚠️  À exécuter UNIQUEMENT après avoir :
--      1. créé le compte garage dans Supabase (Auth > Users),
--      2. vérifié que la connexion fonctionne dans l'app.
--  Tant que cette migration n'est pas lancée, l'app reste
--  fonctionnelle (policies anonymes des migrations précédentes).
--  À coller dans Supabase > SQL Editor puis Run.
-- ============================================================

do $$
declare
  t text;
  tables text[] := array[
    'dossiers','evenements','documents','document_lignes','vehicules',
    'experts','assureurs','clients','emails','entreprise','paiements','relances'
  ];
begin
  foreach t in array tables loop
    -- on retire l'ancienne policy "tout le monde"
    execute format('drop policy if exists %I on public.%I', t || '_all_anon', t);
    -- on autorise uniquement les utilisateurs connectés
    execute format('drop policy if exists %I on public.%I', t || '_all_auth', t);
    execute format(
      'create policy %I on public.%I for all to authenticated using (true) with check (true)',
      t || '_all_auth', t
    );
  end loop;
end $$;

-- Stockage (rapports / logos) : décommente pour exiger aussi la connexion.
-- drop policy if exists "rapports_all_anon" on storage.objects;
-- create policy "rapports_all_auth" on storage.objects
--   for all to authenticated
--   using (bucket_id = 'rapports') with check (bucket_id = 'rapports');
-- drop policy if exists "entreprise_bucket_all_anon" on storage.objects;
-- create policy "entreprise_bucket_all_auth" on storage.objects
--   for all to authenticated
--   using (bucket_id = 'entreprise') with check (bucket_id = 'entreprise');
