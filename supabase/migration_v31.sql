-- Migration v31 — Apparence des factures : modèle de mise en page + couleur
-- Choisis dans le Profil du garage, appliqués à TOUS les PDF (devis, factures,
-- OR, cession, restitution, RIB généré).
-- Idempotente : rejouable sans risque.

alter table entreprise add column if not exists modele_pdf text default 'classique';
alter table entreprise add column if not exists couleur_pdf text default '#7c5cf6';

-- Valeurs possibles pour modele_pdf : 'classique' | 'bandeau' | 'epure'
-- couleur_pdf : couleur hexadécimale (#rrggbb) utilisée comme accent des PDF.
