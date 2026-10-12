-- ============================================================
--  MIGRATION v98 — INSCRIPTION EN LIGNE (v13.41)
--
--  Un garage peut désormais s'abonner SEUL depuis myeasyauto.fr/inscription :
--  ses coordonnées, ses besoins (→ formule conseillée), son choix, le
--  contrat signé en ligne, puis le paiement (Stripe en prélèvement mensuel
--  automatique, lien Qonto ou virement pour l'année en une fois).
--  Les inscriptions réutilisent la table `ventes` (même suivi éditeur,
--  mêmes abonnements / mensualités) avec origine = 'en_ligne'.
--  À exécuter dans Supabase → SQL Editor. Idempotent.
-- ============================================================

-- 1. Une vente en ligne n'a pas forcément de commercial.
alter table public.ventes alter column code_apporteur drop not null;

alter table public.ventes add column if not exists origine text not null default 'commercial'; -- commercial | en_ligne
alter table public.ventes add column if not exists token text;                                 -- lien de reprise / page « merci » (secret)
create unique index if not exists ventes_token_idx on public.ventes (token) where token is not null;
alter table public.ventes add column if not exists source_connaissance text;                   -- « Comment nous avez-vous connu ? »
alter table public.ventes add column if not exists source_detail text;
alter table public.ventes add column if not exists formule_conseillee text;                    -- formule calculée depuis les besoins
alter table public.ventes add column if not exists paiement_en_ligne_mode text;                -- stripe | qonto | virement
alter table public.ventes add column if not exists stripe_customer_id text;
alter table public.ventes add column if not exists stripe_subscription_id text;
alter table public.ventes add column if not exists stripe_checkout_id text;
alter table public.ventes add column if not exists stripe_statut text;                         -- open | complete | expired
alter table public.ventes add column if not exists contrat_envoye_le timestamptz;              -- email de confirmation + contrat PDF
alter table public.ventes add column if not exists activee_le timestamptz;                     -- abonnement + compte créés automatiquement
create index if not exists ventes_origine_idx on public.ventes (origine, created_at desc);
create index if not exists ventes_stripe_sub_idx on public.ventes (stripe_subscription_id) where stripe_subscription_id is not null;

-- 2. Demandes de rappel (depuis le parcours d'inscription, à toute étape).
create table if not exists public.demandes_rappel (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  vente_id      uuid references public.ventes(id) on delete set null,
  garage_nom    text,
  contact_nom   text,
  tel           text not null,
  email         text,
  creneau       text,            -- matin | midi | apres-midi | fin-journee
  message       text,
  etape         text,            -- étape du parcours au moment de la demande
  source_connaissance text,
  formule_conseillee  text,
  traite_le     timestamptz,
  traite_par    text,
  notes         text,
  ip            text
);
alter table public.demandes_rappel enable row level security;
create index if not exists demandes_rappel_ouvertes_idx on public.demandes_rappel (traite_le, created_at desc);
-- Lecture / traitement depuis l'espace éditeur (comptes connectés) ; l'insertion
-- se fait côté serveur (clé service) depuis la route publique.
drop policy if exists demandes_rappel_select on public.demandes_rappel;
create policy demandes_rappel_select on public.demandes_rappel for select to authenticated using (true);
drop policy if exists demandes_rappel_update on public.demandes_rappel;
create policy demandes_rappel_update on public.demandes_rappel for update to authenticated using (true) with check (true);

-- 3. Abonnements : lien Stripe + renouvellement annuel.
alter table public.abonnements add column if not exists origine text not null default 'commercial';
alter table public.abonnements add column if not exists stripe_customer_id text;
alter table public.abonnements add column if not exists stripe_subscription_id text;
alter table public.abonnements add column if not exists date_renouvellement date;              -- forfait annuel : date de reconduction
alter table public.abonnements add column if not exists renouvellement_avise_le timestamptz;   -- avis envoyé 30 j avant
alter table public.abonnements add column if not exists renouvellement_qonto_link_id text;
alter table public.abonnements add column if not exists renouvellement_qonto_url text;
alter table public.abonnements add column if not exists renouvellement_qonto_statut text;
create index if not exists abonnements_stripe_sub_idx on public.abonnements (stripe_subscription_id) where stripe_subscription_id is not null;

-- 4. Mensualités : facture Stripe qui l'a réglée.
alter table public.abonnement_mensualites add column if not exists stripe_invoice_id text;

-- 5. Journal des événements Stripe (idempotence du webhook).
create table if not exists public.stripe_evenements (
  id          text primary key,     -- evt_…
  type        text not null,
  recu_le     timestamptz not null default now(),
  traite      boolean not null default false,
  erreur      text
);
alter table public.stripe_evenements enable row level security; -- aucune politique : clé service uniquement
