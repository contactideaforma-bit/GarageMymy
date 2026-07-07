-- v26 — Profil garage : signature de mail + RIB PDF officiel
-- La signature est ajoutée automatiquement en bas de chaque email.
-- Le RIB uploadé (bucket entreprise) remplace le RIB généré depuis IBAN/BIC
-- quand on coche « RIB du garage » en pièce jointe.

alter table public.entreprise add column if not exists signature_mail text;
alter table public.entreprise add column if not exists rib_path text;
