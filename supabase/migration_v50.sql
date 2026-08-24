-- ============================================================
--  My Easy Auto — Migration v50
--
--  LE CHIFFRAGE DU RAPPORT EST CONSERVÉ SUR LE DOSSIER.
--
--  Problème constaté : les lignes lues dans le rapport d'expertise
--  n'existaient QUE dans le devis et la facture générés à l'import. En
--  supprimant la facture, le garage perdait le chiffrage : le bouton
--  « + Facture » rouvrait une page blanche, donc « impossible d'en
--  générer une nouvelle ».
--
--  On range désormais ces lignes sur le dossier lui-même. Elles servent
--  de SOURCE DE VÉRITÉ pour régénérer un devis ou une facture à
--  l'identique, autant de fois que nécessaire.
--
--  Format (tableau JSON) :
--    [{ "designation": "PORTE AR D (R P)", "quantite": 1,
--       "prix_unitaire": 0, "remise": 0, "categorie": "piece" }, …]
--  Les lignes SANS PRIX sont conservées (opérations comprises dans la
--  main d'œuvre) : elles doivent figurer sur la facture comme au rapport.
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotente.
-- ============================================================

alter table public.dossiers
  add column if not exists chiffrage jsonb;

comment on column public.dossiers.chiffrage is
  'Lignes du rapport d''expertise (source de vérité pour régénérer devis et facture).';
