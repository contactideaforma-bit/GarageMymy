-- ============================================================
--  My Easy Auto — COMPTE DE DÉMONSTRATION (données fictives)
--
--  Objectif : un compte « Carrosserie Démo » rempli de dossiers
--  réalistes couvrant tout le pipeline (Nouveau → Payé), pour les
--  présentations commerciales.
--
--  MODE D'EMPLOI
--   1. Supabase > Authentication > Users > Add user :
--        email : demo@myeasyauto.fr   (mot de passe au choix)
--      (ou adapter v_email ci-dessous à un compte existant)
--   2. Coller ce script dans Supabase > SQL Editor puis Run.
--   3. Rejouable à volonté : il RÉINITIALISE les données du compte
--      démo (et uniquement de ce compte) avant de réinsérer.
--
--  Toutes les données sont FICTIVES (clients, plaques, assureurs,
--  IBAN, SIRET). Les dates sont relatives à now() : la démo reste
--  « fraîche » quel que soit le jour de la présentation.
-- ============================================================

do $$
declare
  v_email text := 'demo@myeasyauto.fr';   -- ← adapter si besoin
  v_owner uuid;
  d1 uuid := gen_random_uuid();  -- Nouveau
  d2 uuid := gen_random_uuid();  -- Expertise
  d3 uuid := gen_random_uuid();  -- Devis
  d4 uuid := gen_random_uuid();  -- Réparation
  d5 uuid := gen_random_uuid();  -- Facture envoyée (cession de créance)
  d6 uuid := gen_random_uuid();  -- Véhicule rendu
  d7 uuid := gen_random_uuid();  -- Payé
  dev3 uuid := gen_random_uuid();
  fac5 uuid := gen_random_uuid();
  fac6 uuid := gen_random_uuid();
  fac7 uuid := gen_random_uuid();
begin
  select id into v_owner from auth.users where email = v_email;
  if v_owner is null then
    raise exception 'Compte % introuvable : crée-le d''abord dans Auth > Users.', v_email;
  end if;

  -- ---------- Réinitialisation du compte démo ----------
  delete from public.document_lignes where owner_id = v_owner;
  delete from public.paiements       where owner_id = v_owner;
  delete from public.relances        where owner_id = v_owner;
  delete from public.documents       where owner_id = v_owner;
  delete from public.evenements      where owner_id = v_owner;
  delete from public.dossiers        where owner_id = v_owner;
  delete from public.vehicules       where owner_id = v_owner;
  delete from public.clients         where owner_id = v_owner;
  delete from public.experts         where owner_id = v_owner;
  delete from public.assureurs       where owner_id = v_owner;

  -- ---------- Profil du garage ----------
  -- (update puis insert : ne dépend d'aucun index unique sur la table)
  update public.entreprise
     set nom = 'Carrosserie de Démonstration',
         adresse = '12 rue des Artisans', code_postal = '92200', ville = 'Neuilly-sur-Seine',
         tel = '01 46 00 00 00', email = 'demo@myeasyauto.fr',
         siret = '000 000 000 00000', tva_intra = 'FR00000000000',
         mentions = 'Compte de démonstration — données fictives.'
   where owner_id = v_owner;
  if not found then
    insert into public.entreprise (owner_id, nom, adresse, code_postal, ville, tel, email, siret, tva_intra, mentions)
    values (v_owner, 'Carrosserie de Démonstration', '12 rue des Artisans', '92200', 'Neuilly-sur-Seine',
            '01 46 00 00 00', 'demo@myeasyauto.fr', '000 000 000 00000', 'FR00000000000',
            'Compte de démonstration — données fictives.');
  end if;

  -- ---------- Annuaire ----------
  insert into public.experts (owner_id, cabinet, adresse, code_postal, ville, tel, email, expert_nom, source) values
    (v_owner, 'Cabinet Expertise Horizon', '4 avenue du Progrès', '92000', 'Nanterre', '01 47 00 11 22', 'contact@expertise-horizon.example', 'Marc Delattre', 'demo'),
    (v_owner, 'BCA Île-de-France (démo)', '18 rue de la Plaine', '92110', 'Clichy', '01 42 00 33 44', 'idf@bca-demo.example', 'Sophie Renaud', 'demo');

  insert into public.assureurs (owner_id, nom, adresse, code_postal, ville, tel, email, source) values
    (v_owner, 'Assurances du Ponant', '1 place de la Défense', '92800', 'Puteaux', '01 40 00 55 66', 'sinistres@ponant-assur.example', 'demo'),
    (v_owner, 'MutuAuto', '25 boulevard Haussmann', '75009', 'Paris', '01 44 00 77 88', 'gestion@mutuauto.example', 'demo'),
    (v_owner, 'Groupe Sequana Assurances', '8 quai de Seine', '92150', 'Suresnes', '01 45 00 99 00', 'auto@sequana-assur.example', 'demo');

  insert into public.clients (owner_id, nom, email, telephone, adresse, code_postal, ville, source) values
    (v_owner, 'Bernard Lefèvre',  'b.lefevre@example.fr',  '06 11 22 33 44', '3 rue des Lilas',      '92200', 'Neuilly-sur-Seine', 'demo'),
    (v_owner, 'Nadia Belkacem',   'n.belkacem@example.fr', '06 22 33 44 55', '14 avenue Foch',       '92300', 'Levallois-Perret',  'demo'),
    (v_owner, 'Julien Moreau',    'j.moreau@example.fr',   '06 33 44 55 66', '27 rue de la Gare',    '92600', 'Asnières-sur-Seine','demo'),
    (v_owner, 'Claire Dubois',    'c.dubois@example.fr',   '06 44 55 66 77', '9 impasse des Roses',  '92110', 'Clichy',            'demo'),
    (v_owner, 'SARL TransExpress','contact@transexpress.example', '01 47 11 22 33', '40 rue du Commerce', '92000', 'Nanterre',    'demo'),
    (v_owner, 'Sylvie Marchand',  's.marchand@example.fr', '06 55 66 77 88', '5 allée Verte',        '92700', 'Colombes',          'demo'),
    (v_owner, 'Karim Haddad',     'k.haddad@example.fr',   '06 66 77 88 99', '11 rue Pasteur',       '92400', 'Courbevoie',        'demo');

  -- ---------- Dossiers ----------
  -- d1 · NOUVEAU (créé hier)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, assureur, client_nom, client_tel, client_email, au_garage)
  values (d1, v_owner, now() - interval '1 day', 'nouveau', null, 'GK-482-PL', 'Peugeot 208 II',
    (now() - interval '4 days')::date, 'SIN-2026-08412', 'MutuAuto',
    'Karim Haddad', '06 66 77 88 99', 'k.haddad@example.fr', false);

  -- d2 · EXPERTISE (RDV expert dans 3 jours)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, cabinet_expert, cabinet_tel, cabinet_email, expert_nom, date_expertise,
    numero_police, assureur, assureur_tel, assureur_email, client_nom, client_tel, client_email, au_garage)
  values (d2, v_owner, now() - interval '5 days', 'expertise', 1890.00, 'FB-219-QN', 'Renault Clio V',
    (now() - interval '9 days')::date, 'SIN-2026-08327', 'Cabinet Expertise Horizon', '01 47 00 11 22',
    'contact@expertise-horizon.example', 'Marc Delattre', (now() + interval '3 days')::date,
    'POL-778-451', 'Assurances du Ponant', '01 40 00 55 66', 'sinistres@ponant-assur.example',
    'Nadia Belkacem', '06 22 33 44 55', 'n.belkacem@example.fr', true);

  -- d3 · DEVIS (devis à faire signer)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, cabinet_expert, expert_nom, numero_police, assureur,
    client_nom, client_tel, client_email, client_adresse, client_code_postal, client_ville, au_garage)
  values (d3, v_owner, now() - interval '8 days', 'devis', 1990.20, 'EH-654-JT', 'Citroën C3 III',
    (now() - interval '15 days')::date, 'SIN-2026-08256', 'BCA Île-de-France (démo)', 'Sophie Renaud',
    'POL-102-889', 'MutuAuto', 'Julien Moreau', '06 33 44 55 66', 'j.moreau@example.fr',
    '27 rue de la Gare', '92600', 'Asnières-sur-Seine', false);

  -- d4 · RÉPARATION (au garage cette semaine)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, cabinet_expert, expert_nom, numero_police, assureur,
    client_nom, client_tel, reparation_debut, reparation_fin, reparateur, au_garage)
  values (d4, v_owner, now() - interval '12 days', 'reparation', 3660.00, 'DA-847-KL', 'Volkswagen Golf VIII',
    (now() - interval '20 days')::date, 'SIN-2026-08188', 'Cabinet Expertise Horizon', 'Marc Delattre',
    'POL-455-230', 'Groupe Sequana Assurances', 'SARL TransExpress', '01 47 11 22 33',
    (now() - interval '2 days')::date, (now() + interval '4 days')::date, 'Atelier 1 — Yann', true);

  -- d5 · FACTURE ENVOYÉE (cession de créance, en attente assurance)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, cabinet_expert, expert_nom, numero_police, assureur, assureur_email,
    client_nom, client_tel, client_email, mode_cession, relance_auto, au_garage,
    reparation_debut, reparation_fin, note, note_maj)
  values (d5, v_owner, now() - interval '35 days', 'facture', 2814.72, 'CS-318-MV', 'Renault Mégane IV',
    (now() - interval '45 days')::date, 'SIN-2026-07902', 'BCA Île-de-France (démo)', 'Sophie Renaud',
    'POL-908-114', 'Assurances du Ponant', 'sinistres@ponant-assur.example',
    'Bernard Lefèvre', '06 11 22 33 44', 'b.lefevre@example.fr', true, true, false,
    (now() - interval '20 days')::date, (now() - interval '12 days')::date,
    'Cession de créance signée le ' || to_char(now() - interval '18 days', 'DD/MM') || '. Relance n°1 envoyée — gestionnaire : Mme Petit.', now() - interval '3 days');

  -- d6 · VÉHICULE RENDU (reste la franchise à encaisser… déjà réglée en CB)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, numero_police, assureur, client_nom, client_tel, franchise, au_garage,
    reparation_debut, reparation_fin)
  values (d6, v_owner, now() - interval '28 days', 'rendu', 1548.00, 'BX-905-RC', 'Fiat 500',
    (now() - interval '38 days')::date, 'SIN-2026-07840', 'POL-334-672', 'MutuAuto',
    'Claire Dubois', '06 44 55 66 77', 350.00, false,
    (now() - interval '15 days')::date, (now() - interval '9 days')::date);

  -- d7 · PAYÉ (dossier bouclé — modèle de bout en bout)
  insert into public.dossiers (id, owner_id, created_at, statut, montant, immatriculation, marque_modele,
    date_sinistre, numero_sinistre, numero_police, assureur, client_nom, client_tel, au_garage,
    reparation_debut, reparation_fin)
  values (d7, v_owner, now() - interval '60 days', 'paye', 2874.00, 'AT-176-GD', 'Toyota Yaris IV',
    (now() - interval '70 days')::date, 'SIN-2026-07511', 'POL-556-908', 'Groupe Sequana Assurances',
    'Sylvie Marchand', '06 55 66 77 88', false,
    (now() - interval '45 days')::date, (now() - interval '38 days')::date);

  -- ---------- Véhicules ----------
  insert into public.vehicules (owner_id, immatriculation, marque_modele, proprietaire, au_garage, notes) values
    (v_owner, 'FB-219-QN', 'Renault Clio V',        'Nadia Belkacem',    true,  'En attente d''expertise'),
    (v_owner, 'DA-847-KL', 'Volkswagen Golf VIII',  'SARL TransExpress', true,  'Réparation en cours — atelier 1'),
    (v_owner, 'GK-482-PL', 'Peugeot 208 II',        'Karim Haddad',      false, 'Dépôt prévu après accord'),
    (v_owner, 'CS-318-MV', 'Renault Mégane IV',     'Bernard Lefèvre',   false, 'Rendu — facture assurance en attente');

  -- ---------- Agenda ----------
  insert into public.evenements (owner_id, dossier_id, titre, description, date_evenement, categorie, avec_qui) values
    (v_owner, d2, 'Expertise Clio V — M. Delattre', 'Passage du cabinet Expertise Horizon à l''atelier.', now() + interval '3 days', 'rdv_expert', 'Marc Delattre'),
    (v_owner, d1, 'Dépôt Peugeot 208 — K. Haddad', 'Dépôt du véhicule + photos du sinistre.', now() + interval '1 day', 'rdv_client', 'Karim Haddad'),
    (v_owner, d4, 'Restitution Golf — TransExpress', 'Fin de réparation prévue, PV de restitution à signer.', now() + interval '4 days', 'rdv_client', 'SARL TransExpress'),
    (v_owner, d3, 'Signature devis C3 — J. Moreau', 'Faire signer le devis + ordre de réparation (tablette).', now() + interval '2 days', 'rdv_client', 'Julien Moreau');

  -- ---------- Documents ----------
  -- Devis du dossier d3 (envoyé, à faire accepter)
  insert into public.documents (id, owner_id, dossier_id, type, numero, date_document, date_echeance, statut, tva, total_ht, total_tva, total_ttc, notes)
  values (dev3, v_owner, d3, 'devis', 'DEV-2026-104', (now() - interval '4 days')::date, (now() + interval '26 days')::date, 'envoye', 20, 1658.50, 331.70, 1990.20, 'Selon rapport BCA — accord attendu.');

  insert into public.document_lignes (owner_id, document_id, designation, quantite, prix_unitaire, ordre, categorie) values
    (v_owner, dev3, 'Aile avant droite (pièce origine)',            1,    286.40, 1, 'piece'),
    (v_owner, dev3, 'Pare-chocs avant (peint à part)',              1,    412.90, 2, 'piece'),
    (v_owner, dev3, 'Projecteur avant droit',                       1,    318.20, 3, 'piece'),
    (v_owner, dev3, 'M.O. Tôlerie T1',                              3.5,   58.00, 4, 'mo'),
    (v_owner, dev3, 'M.O. Tôlerie T2',                              2.0,   66.00, 5, 'mo'),
    (v_owner, dev3, 'M.O. Peinture',                                3.0,   68.00, 6, 'mo'),
    (v_owner, dev3, 'Ingrédients peinture',                         3.0,   34.00, 7, 'mo');

  -- Facture du dossier d5 (envoyée à l'assurance, cession de créance)
  insert into public.documents (id, owner_id, dossier_id, type, numero, date_document, date_echeance, statut, tva, total_ht, total_tva, total_ttc, mode_paiement, notes)
  values (fac5, v_owner, d5, 'facture', 'FAC-2026-112', (now() - interval '10 days')::date, (now() + interval '20 days')::date, 'envoye', 20, 2345.60, 469.12, 2814.72, 'assurance', 'Cession de créance signée — paiement direct assureur.');

  insert into public.document_lignes (owner_id, document_id, designation, quantite, prix_unitaire, ordre, categorie) values
    (v_owner, fac5, 'Porte avant gauche (pièce origine)',           1,    534.60, 1, 'piece'),
    (v_owner, fac5, 'Rétroviseur gauche (rabattable élec.)',        1,    287.90, 2, 'piece'),
    (v_owner, fac5, 'Baguette de porte + agrafes',                  1,     96.10, 3, 'piece'),
    (v_owner, fac5, 'M.O. Tôlerie T1',                              6.0,   58.00, 4, 'mo'),
    (v_owner, fac5, 'M.O. Tôlerie T3 (structurel)',                 2.5,   74.00, 5, 'mo'),
    (v_owner, fac5, 'M.O. Peinture',                                7.0,   68.00, 6, 'mo'),
    (v_owner, fac5, 'Ingrédients peinture',                         7.0,   34.00, 7, 'mo'),
    (v_owner, fac5, 'Forfait mise à niveau ADAS après remontage',   1,    180.00, 8, 'autre');

  -- Facture du dossier d6 (franchise client encaissée, solde assurance attendu)
  insert into public.documents (id, owner_id, dossier_id, type, numero, date_document, date_echeance, statut, tva, total_ht, total_tva, total_ttc, mode_paiement)
  values (fac6, v_owner, d6, 'facture', 'FAC-2026-108', (now() - interval '8 days')::date, (now() + interval '22 days')::date, 'envoye', 20, 1290.00, 258.00, 1548.00, 'multiple');

  insert into public.document_lignes (owner_id, document_id, designation, quantite, prix_unitaire, ordre, categorie) values
    (v_owner, fac6, 'Aile arrière droite (pièce origine)',          1,    342.00, 1, 'piece'),
    (v_owner, fac6, 'Poignée de porte arrière',                     1,    118.00, 2, 'piece'),
    (v_owner, fac6, 'M.O. Tôlerie T1',                              5.0,   58.00, 3, 'mo'),
    (v_owner, fac6, 'M.O. Tôlerie T2',                              2.0,   66.00, 4, 'mo'),
    (v_owner, fac6, 'M.O. Peinture',                                4.0,   68.00, 5, 'mo'),
    (v_owner, fac6, 'Ingrédients peinture',                         4.0,   34.00, 6, 'mo');

  -- Facture du dossier d7 (payée + acquittée)
  insert into public.documents (id, owner_id, dossier_id, type, numero, date_document, date_echeance, statut, tva, total_ht, total_tva, total_ttc, mode_paiement, acquitte)
  values (fac7, v_owner, d7, 'facture', 'FAC-2026-097', (now() - interval '35 days')::date, (now() - interval '5 days')::date, 'paye', 20, 2395.00, 479.00, 2874.00, 'virement', true);

  insert into public.document_lignes (owner_id, document_id, designation, quantite, prix_unitaire, ordre, categorie) values
    (v_owner, fac7, 'Capot (pièce adaptable certifiée)',            1,    421.00, 1, 'piece'),
    (v_owner, fac7, 'Grille de calandre',                           1,    156.00, 2, 'piece'),
    (v_owner, fac7, 'Optique avant gauche',                         1,    538.00, 3, 'piece'),
    (v_owner, fac7, 'M.O. Tôlerie T1',                              8.0,   58.00, 4, 'mo'),
    (v_owner, fac7, 'M.O. Peinture',                                8.0,   68.00, 5, 'mo'),
    (v_owner, fac7, 'Ingrédients peinture',                         8.0,   34.00, 6, 'mo');

  -- ---------- Paiements ----------
  insert into public.paiements (owner_id, dossier_id, document_id, montant, date_paiement, moyen, reference, notes) values
    (v_owner, d7, fac7, 2874.00, (now() - interval '6 days')::date,  'virement', 'VIR SEQUANA 88104', 'Règlement assurance — dossier soldé.'),
    (v_owner, d6, fac6,  350.00, (now() - interval '9 days')::date,  'cb',       'TPE-4471',          'Franchise client encaissée à la restitution.');

  -- ---------- Relances ----------
  insert into public.relances (owner_id, dossier_id, document_id, date_relance, canal, notes) values
    (v_owner, d5, fac5, (now() - interval '3 days')::date, 'email', 'Relance n°1 à Assurances du Ponant — accusé de réception reçu, gestionnaire Mme Petit.'),
    (v_owner, d6, fac6, (now() - interval '1 day')::date,  'telephone', 'MutuAuto : virement du solde annoncé sous 10 jours.');

  raise notice 'Compte démo initialisé pour % (owner %) : 7 dossiers, 4 documents, agenda et annuaire remplis.', v_email, v_owner;
end $$;
