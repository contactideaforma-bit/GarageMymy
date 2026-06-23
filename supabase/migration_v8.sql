-- ============================================================
--  GarageMYMY — Migration v8
--  MULTI-LOCATAIRE : chaque compte ne voit QUE ses propres données.
--
--  Ajoute une colonne owner_id (= auth.uid()) sur toutes les tables
--  métier, attribue les données EXISTANTES au PREMIER compte créé
--  (le garage d'origine), puis remplace les policies
--  « tous les utilisateurs connectés » par des policies
--  « propriétaire uniquement ».
--
--  Grâce au défaut owner_id = auth.uid(), les NOUVELLES insertions
--  faites depuis l'app récupèrent automatiquement le bon propriétaire :
--  AUCUN changement de code applicatif n'est nécessaire.
--
--  ⚠️  PRÉREQUIS
--    1. La migration v6 (policies "authenticated") doit déjà être passée.
--    2. Au moins UN compte existe dans Supabase > Auth > Users.
--    3. Les données déjà présentes seront rattachées au 1er compte créé.
--       Les autres comptes (ex. ton 2e compte) démarreront donc à vide.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent.
-- ============================================================

do $$
declare
  t text;
  first_owner uuid;
  tables text[] := array[
    'dossiers','evenements','documents','document_lignes','vehicules',
    'experts','assureurs','clients','emails','entreprise','paiements','relances'
  ];
begin
  -- Compte de référence pour les lignes déjà existantes (le plus ancien).
  select id into first_owner from auth.users order by created_at asc limit 1;

  if first_owner is null then
    raise exception 'Aucun compte dans auth.users : crée d''abord un compte (Auth > Users) avant de lancer cette migration.';
  end if;

  foreach t in array tables loop
    -- 1) Colonne owner_id (nullable d'abord, pour pouvoir backfiller l'existant).
    execute format(
      'alter table public.%I add column if not exists owner_id uuid references auth.users(id) on delete cascade',
      t
    );

    -- 2) Rattacher les lignes existantes au garage d'origine.
    execute format('update public.%I set owner_id = %L where owner_id is null', t, first_owner);

    -- 3) Défaut = utilisateur courant : auto-rempli aux prochaines insertions.
    execute format('alter table public.%I alter column owner_id set default auth.uid()', t);

    -- 4) NOT NULL (sûr car toutes les lignes sont désormais rattachées).
    execute format('alter table public.%I alter column owner_id set not null', t);

    -- 5) Index pour les filtres par propriétaire.
    execute format('create index if not exists %I on public.%I(owner_id)', t || '_owner_idx', t);

    -- 6) Policies : on retire les anciennes, on crée la policy "propriétaire".
    execute format('drop policy if exists %I on public.%I', t || '_all_anon', t);
    execute format('drop policy if exists %I on public.%I', t || '_all_auth', t);
    execute format('drop policy if exists %I on public.%I', t || '_owner', t);
    execute format(
      'create policy %I on public.%I for all to authenticated '
      || 'using (owner_id = auth.uid()) with check (owner_id = auth.uid())',
      t || '_owner', t
    );
  end loop;
end $$;

-- ============================================================
--  NON couvert par cette migration (à traiter séparément si besoin) :
--   • mail_config : config SMTP unique, accédée côté serveur (service role).
--     Reste GLOBALE pour l'instant -> tous les garages enverraient depuis
--     la même boîte. Pour une config SMTP par garage, il faudra ajouter
--     owner_id ici ET modifier les routes /api/mail-config et /api/send-email
--     pour identifier l'utilisateur connecté.
--   • Storage (buckets 'rapports' et 'entreprise') : les fichiers ne sont
--     pas encore cloisonnés par propriétaire (accès par utilisateur connecté).
--     Cloisonnement possible via un préfixe de chemin = owner_id + policies
--     storage basées sur ce préfixe.
-- ============================================================
