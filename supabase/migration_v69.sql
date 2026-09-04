-- ============================================================
--  My Easy Auto — Migration v69 (v12.5)
--
--  1. COMMANDE DE PIÈCES : référence constructeur + quantité par ligne,
--     pour le PDF « Bon de commande pièces » remis au carrossier.
--
--  2. CORBEILLE (« Supprimé récemment », onglet Historique) :
--     tout ce qui est supprimé dans l'appli est photographié (JSON) par
--     un TRIGGER avant de disparaître, et reste RESTAURABLE 30 jours.
--     Aucun changement dans le code des suppressions : le trigger capte
--     aussi les suppressions en cascade (les documents d'un dossier
--     supprimé, par exemple).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. Commande de pièces ----------
alter table public.commandes_pieces
  add column if not exists reference text,
  add column if not exists quantite numeric not null default 1;

-- ---------- 2. Corbeille ----------
create table if not exists public.corbeille (
  id           uuid primary key default gen_random_uuid(),
  supprime_le  timestamptz not null default now(),
  table_name   text not null,          -- table d'origine
  ligne_id     uuid not null,          -- id de la ligne supprimée
  libelle      text,                   -- pour l'affichage (n°, objet, désignation…)
  dossier_id   uuid,                   -- dossier concerné (le dossier lui-même pour 'dossiers')
  donnees      jsonb not null,         -- la ligne complète, telle qu'elle était
  owner_id     uuid not null references auth.users(id) on delete cascade
);

create index if not exists corbeille_owner_date_idx on public.corbeille (owner_id, supprime_le desc);
create index if not exists corbeille_dossier_idx on public.corbeille (dossier_id);
create index if not exists corbeille_date_idx on public.corbeille (supprime_le);

alter table public.corbeille enable row level security;
drop policy if exists corbeille_owner on public.corbeille;
create policy corbeille_owner on public.corbeille
  for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Photographie la ligne supprimée. SECURITY DEFINER : l'écriture dans la
-- corbeille ne dépend pas des policies de la table d'origine.
create or replace function public.corbeille_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  j        jsonb;
  v_owner  uuid;
  v_id     uuid;
  v_doss   uuid;
  v_lib    text;
begin
  j := to_jsonb(old);
  v_owner := coalesce(auth.uid(), nullif(j->>'owner_id', '')::uuid);
  v_id := nullif(j->>'id', '')::uuid;
  if v_owner is null or v_id is null then
    return old;
  end if;

  v_doss := case
    when tg_table_name = 'dossiers' then v_id
    else nullif(j->>'dossier_id', '')::uuid
  end;

  v_lib := coalesce(
    nullif(j->>'numero', ''), nullif(j->>'numero_sinistre', ''), nullif(j->>'objet', ''),
    nullif(j->>'titre', ''), nullif(j->>'designation', ''), nullif(j->>'texte', ''),
    nullif(j->>'immatriculation', ''), nullif(j->>'nom', ''), nullif(j->>'description', ''),
    nullif(j->>'demande', ''), ''
  );

  insert into public.corbeille (table_name, ligne_id, libelle, dossier_id, donnees, owner_id)
  values (tg_table_name, v_id, left(v_lib, 120), v_doss, j, v_owner);

  -- Ménage : rien n'est conservé au-delà de 30 jours.
  delete from public.corbeille where supprime_le < now() - interval '30 days';

  return old;
end;
$$;

-- Pose le trigger sur chaque table métier qui existe.
do $$
declare
  t text;
  tables text[] := array[
    'dossiers','documents','document_lignes','emails','evenements','paiements','relances',
    'ardoise','commandes_pieces','pieces_dossier','ordres_reparation','cessions_creance',
    'restitutions','demandes_assurance','heures_secretariat','clients','vehicules',
    'conversation_messages','transferts_garantie','photos_etat','flotte_vehicules'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists %I on public.%I', t || '_corbeille', t);
      execute format(
        'create trigger %I before delete on public.%I for each row execute function public.corbeille_capture()',
        t || '_corbeille', t
      );
    end if;
  end loop;
end $$;
