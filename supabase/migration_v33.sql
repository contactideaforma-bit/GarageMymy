-- ============================================================
--  My Easy Auto — Migration v33 (CORRECTIFS AUDIT v6.2)
--
--  1. usage_ia : dédoublonnage + contrainte UNIQUE (owner_id, mois)
--     + fonction d'incrément ATOMIQUE (le quota IA était contournable :
--     deux analyses simultanées créaient 2 lignes → compteur cassé).
--  2. entreprise : une seule fiche par garage (2 onglets Profil ouverts
--     pouvaient créer 2 lignes → PDF/emails piochaient au hasard).
--  3. relances : colonne auto + index UNIQUE partiel → une relance
--     automatique ne peut plus partir 2 fois le même jour (idempotence).
--  4. Annuaire (clients / experts / assureurs) : unicité du nom par
--     garage (les doublons existants sont fusionnés en gardant le plus
--     ancien enregistrement).
--  5. Bucket PRIVÉ 'prive' pour le RIB (jusqu'ici dans le bucket public
--     'entreprise' → accessible par simple URL). ⚠️ Re-uploade ton RIB
--     dans Profil du garage après cette migration.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

-- ---------- 1. usage_ia : incrément atomique ----------
-- La contrainte UNIQUE (owner_id, mois) existe déjà (v25). Le problème était
-- le read-modify-write applicatif : deux analyses simultanées → un incrément
-- perdu (ou insert en échec silencieux) → compteur de quota faussé.

-- Incrément atomique : INSERT … ON CONFLICT → plus de course possible.
-- Appelée UNIQUEMENT côté serveur (service role) par lib/quotaIA.ts.
create or replace function public.incrementer_usage_ia(
  p_owner uuid,
  p_mois text,
  p_tokens_entree bigint,
  p_tokens_sortie bigint,
  p_cout numeric
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.usage_ia (owner_id, mois, appels, tokens_entree, tokens_sortie, cout_eur)
  values (p_owner, p_mois, 1, p_tokens_entree, p_tokens_sortie, round(p_cout, 4))
  on conflict (owner_id, mois) do update set
    appels        = usage_ia.appels + 1,
    tokens_entree = usage_ia.tokens_entree + excluded.tokens_entree,
    tokens_sortie = usage_ia.tokens_sortie + excluded.tokens_sortie,
    cout_eur      = round(usage_ia.cout_eur + excluded.cout_eur, 4);
$$;

-- Seul le service role doit pouvoir l'appeler (pas les clients).
revoke execute on function public.incrementer_usage_ia(uuid, text, bigint, bigint, numeric) from public, anon, authenticated;

-- ---------- 2. entreprise : une seule fiche par garage ----------

-- Garde la fiche la plus ancienne de chaque garage, supprime les doublons.
delete from public.entreprise e
using (
  select id, row_number() over (partition by owner_id order by created_at asc, id asc) as rn
  from public.entreprise
  where owner_id is not null
) d
where e.id = d.id and d.rn > 1;

create unique index if not exists entreprise_owner_uniq
  on public.entreprise(owner_id) where owner_id is not null;

-- ---------- 3. relances : idempotence des relances AUTOMATIQUES ----------

alter table public.relances add column if not exists auto boolean default false;

-- Une seule relance AUTO par facture et par jour (les relances manuelles
-- restent libres : on peut journaliser email + téléphone le même jour).
create unique index if not exists relances_auto_doc_jour_uniq
  on public.relances(document_id, date_relance) where auto is true;

-- ---------- 4. Annuaire : unicité du nom par garage ----------

-- Fusion des doublons (on garde le plus ancien de chaque nom normalisé).
delete from public.clients c
using (
  select id, row_number() over (
    partition by owner_id, lower(trim(nom)) order by created_at asc, id asc
  ) as rn
  from public.clients where nom is not null
) d
where c.id = d.id and d.rn > 1;

-- Les experts sont identifiés par leur CABINET (pas de colonne nom).
delete from public.experts e
using (
  select id, row_number() over (
    partition by owner_id, lower(trim(cabinet)) order by created_at asc, id asc
  ) as rn
  from public.experts where cabinet is not null
) d
where e.id = d.id and d.rn > 1;

delete from public.assureurs a
using (
  select id, row_number() over (
    partition by owner_id, lower(trim(nom)) order by created_at asc, id asc
  ) as rn
  from public.assureurs where nom is not null
) d
where a.id = d.id and d.rn > 1;

create unique index if not exists clients_owner_nom_uniq
  on public.clients(owner_id, lower(trim(nom))) where nom is not null;
create unique index if not exists experts_owner_cabinet_uniq
  on public.experts(owner_id, lower(trim(cabinet))) where cabinet is not null;
create unique index if not exists assureurs_owner_nom_uniq
  on public.assureurs(owner_id, lower(trim(nom))) where nom is not null;

-- ---------- 5. Bucket privé 'prive' (RIB & docs sensibles) ----------

insert into storage.buckets (id, name, public)
values ('prive', 'prive', false)
on conflict (id) do update set public = false;

drop policy if exists prive_insert_auth on storage.objects;
create policy prive_insert_auth on storage.objects
  for insert to authenticated with check (bucket_id = 'prive');

drop policy if exists prive_select_auth on storage.objects;
create policy prive_select_auth on storage.objects
  for select to authenticated using (bucket_id = 'prive');

drop policy if exists prive_update_auth on storage.objects;
create policy prive_update_auth on storage.objects
  for update to authenticated using (bucket_id = 'prive');

drop policy if exists prive_delete_auth on storage.objects;
create policy prive_delete_auth on storage.objects
  for delete to authenticated using (bucket_id = 'prive');
