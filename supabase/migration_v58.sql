-- ============================================================
--  My Easy Auto — Migration v58 (v10.6)
--  CONTRATS DE COLLABORATION : contrat d'apporteur d'affaires
--  (commercial) et contrat de prestation (secrétaire) générés,
--  modifiés et signés depuis la fiche du collaborateur
--  (/admin/collaborateurs/[id]). Le contenu (articles) est stocké
--  en jsonb pour régénérer le PDF à l'identique.
--
--  RLS : le COMMERCIAL rattaché (collaborateurs.owner_id) LIT ses
--  propres documents (espace « Mes documents ») ; toute écriture
--  passe par /api/admin/donnees (service role). La secrétaire n'a
--  pas de compte : ses documents lui sont envoyés par email.
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

create table if not exists public.collaborateur_documents (
  id                       uuid primary key default gen_random_uuid(),
  created_at               timestamptz not null default now(),
  collaborateur_id         uuid not null references public.collaborateurs(id) on delete cascade,
  type                     text not null default 'contrat' check (type in ('contrat')),
  modele                   text not null check (modele in ('apporteur','prestation')),
  titre                    text not null,
  version                  text,                -- version du modèle (ex. v1.3)
  contenu                  jsonb,               -- blocs + articles modifiés (régénération du PDF)
  statut                   text not null default 'brouillon' check (statut in ('brouillon','signe')),
  signature_collaborateur  text,                -- dataURL PNG
  signature_editeur        text,                -- dataURL PNG
  signe_le                 timestamptz,
  envoye_le                timestamptz,
  envoye_a                 text,
  notes                    text
);

alter table public.collaborateur_documents enable row level security;

-- Le commercial connecté lit les documents de SA fiche.
drop policy if exists collaborateur_documents_select_own on public.collaborateur_documents;
create policy collaborateur_documents_select_own on public.collaborateur_documents
  for select to authenticated
  using (exists (
    select 1 from public.collaborateurs c
    where c.id = collaborateur_id and c.owner_id = auth.uid()
  ));

create index if not exists collaborateur_documents_collab_idx
  on public.collaborateur_documents (collaborateur_id);
