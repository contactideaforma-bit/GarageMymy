-- v29 : mention "Acquittée" sur les factures (case à cocher).
-- Le tampon du garage est généré côté PDF (aucune donnée nouvelle).
-- Idempotent : exécutable plusieurs fois sans erreur.

alter table documents add column if not exists acquitte boolean not null default false;
