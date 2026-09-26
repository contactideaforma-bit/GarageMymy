-- ============================================================
--  MIGRATION v90 — JETONS COURRIERS LA POSTE (v13.28)
--
--  Compte Maileva COMMUN (celui de l'éditeur) : chaque garage paie ses
--  propres envois avec des jetons prépayés.
--    · 1 lettre simple        = 1 jeton (2 si plus de 3 feuilles)
--    · 1 recommandé AR        = 5 jetons (6 si plus de 3 feuilles)
--  Achat depuis l'appli par lien de paiement Qonto (CB, Apple Pay,
--  PayPal) ; crédit automatique une fois le paiement constaté.
--
--  Toutes les écritures passent par des fonctions SQL appelées par le
--  SERVEUR (clé service) : le navigateur ne peut que LIRE son solde.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
--  Pré-requis : migration_v89.sql.
-- ============================================================

create table if not exists jetons_soldes (
  owner_id uuid primary key,
  solde integer not null default 0 check (solde >= 0),
  updated_at timestamptz default now()
);

create table if not exists achats_jetons (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  pack text not null,
  jetons integer not null check (jetons > 0),
  montant_ht numeric not null,
  montant_ttc numeric not null,
  statut text not null default 'en_attente',   -- en_attente | paye | expire | annule
  qonto_link_id text,
  qonto_url text,
  credite boolean not null default false,
  paye_le timestamptz,
  derniere_verif timestamptz,
  created_at timestamptz default now()
);

create table if not exists jetons_mouvements (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  delta integer not null,
  motif text not null,              -- achat | envoi | remboursement | geste | ajustement
  libelle text,
  envoi_id uuid,
  achat_id uuid,
  solde_apres integer,
  auteur text,
  created_at timestamptz default now()
);

create index if not exists achats_jetons_owner_idx on achats_jetons (owner_id, created_at desc);
create index if not exists achats_jetons_attente_idx on achats_jetons (statut) where statut = 'en_attente';
create index if not exists jetons_mouvements_owner_idx on jetons_mouvements (owner_id, created_at desc);

-- Compte Maileva COMMUN : la ligne marquée « commun » (enregistrée par
-- l'éditeur) sert à tous les garages qui n'ont pas de compte propre.
alter table maileva_config add column if not exists commun boolean not null default false;

alter table envois_postaux add column if not exists jetons integer not null default 0;
alter table envois_postaux add column if not exists feuilles integer;
alter table envois_postaux add column if not exists rembourse boolean not null default false;

-- Lecture par le garage connecté uniquement.
alter table jetons_soldes enable row level security;
alter table achats_jetons enable row level security;
alter table jetons_mouvements enable row level security;
drop policy if exists jetons_soldes_lecture on jetons_soldes;
create policy jetons_soldes_lecture on jetons_soldes for select to authenticated using (owner_id = auth.uid());
drop policy if exists achats_jetons_lecture on achats_jetons;
create policy achats_jetons_lecture on achats_jetons for select to authenticated using (owner_id = auth.uid());
drop policy if exists jetons_mouvements_lecture on jetons_mouvements;
create policy jetons_mouvements_lecture on jetons_mouvements for select to authenticated using (owner_id = auth.uid());

-- ---------- Débit ATOMIQUE (jamais de solde négatif, même en double clic) ----------
create or replace function jetons_debiter(p_owner uuid, p_n integer, p_libelle text, p_envoi uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_solde integer;
begin
  if p_n <= 0 then
    select solde into v_solde from jetons_soldes where owner_id = p_owner;
    return coalesce(v_solde, 0);
  end if;
  update jetons_soldes set solde = solde - p_n, updated_at = now()
    where owner_id = p_owner and solde >= p_n
    returning solde into v_solde;
  if v_solde is null then
    raise exception 'SOLDE_INSUFFISANT';
  end if;
  insert into jetons_mouvements (owner_id, delta, motif, libelle, envoi_id, solde_apres)
    values (p_owner, -p_n, 'envoi', p_libelle, p_envoi, v_solde);
  return v_solde;
end $$;

-- ---------- Crédit (remboursement, geste commercial, ajustement) ----------
create or replace function jetons_crediter(p_owner uuid, p_n integer, p_motif text, p_libelle text, p_envoi uuid, p_achat uuid, p_auteur text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_solde integer;
begin
  insert into jetons_soldes (owner_id, solde) values (p_owner, 0) on conflict (owner_id) do nothing;
  update jetons_soldes set solde = greatest(0, solde + p_n), updated_at = now()
    where owner_id = p_owner returning solde into v_solde;
  insert into jetons_mouvements (owner_id, delta, motif, libelle, envoi_id, achat_id, solde_apres, auteur)
    values (p_owner, p_n, p_motif, p_libelle, p_envoi, p_achat, v_solde, p_auteur);
  return v_solde;
end $$;

-- ---------- Crédit d'un achat payé : IDEMPOTENT (un achat n'est crédité qu'une fois) ----------
create or replace function jetons_crediter_achat(p_achat uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare a achats_jetons%rowtype;
begin
  update achats_jetons set credite = true, statut = 'paye', paye_le = coalesce(paye_le, now())
    where id = p_achat and credite = false
    returning * into a;
  if a.id is null then
    return null; -- déjà crédité
  end if;
  return jetons_crediter(a.owner_id, a.jetons, 'achat', 'Achat ' || a.pack || ' (' || a.jetons || ' jetons)', null, a.id, 'qonto');
end $$;

-- Seul le serveur (clé service) peut appeler ces fonctions.
revoke all on function jetons_debiter(uuid, integer, text, uuid) from public, anon, authenticated;
revoke all on function jetons_crediter(uuid, integer, text, text, uuid, uuid, text) from public, anon, authenticated;
revoke all on function jetons_crediter_achat(uuid) from public, anon, authenticated;
grant execute on function jetons_debiter(uuid, integer, text, uuid) to service_role;
grant execute on function jetons_crediter(uuid, integer, text, text, uuid, uuid, text) to service_role;
grant execute on function jetons_crediter_achat(uuid) to service_role;

comment on table achats_jetons is 'Achats de jetons courriers par lien de paiement Qonto (v13.28).';
comment on table jetons_mouvements is 'Journal des jetons courriers : achats, envois, remboursements, gestes (v13.28).';
