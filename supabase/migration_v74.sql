-- ============================================================
--  My Easy Auto — Migration v74 (v13.2)
--
--  GUIDE « VÉHICULE DE PRÊT » : CONDITIONS DES ASSUREURS
--
--  Avant d'attribuer un véhicule de prêt, le garage vérifie ce que
--  l'assurance du client prend en charge : garantie incluse ou en option,
--  durée par événement (panne / accident / vol / incendie), catégorie du
--  véhicule, plafond journalier si l'assisteur ne fournit pas de véhicule,
--  conditions (immobilisation minimale, garage agréé, accord préalable…),
--  coordonnées de l'assisteur.
--
--  Deux niveaux de fiches dans la même table :
--    • owner_id NULL  = fiche COMMUNE, rédigée par l'éditeur à partir des
--      conditions générales publiques (lecture pour tous les garages,
--      modification réservée aux comptes ADMIN) ;
--    • owner_id = compte = fiche PERSONNELLE du garage : soit un assureur
--      ajouté par lui, soit une COPIE personnalisée d'une fiche commune
--      (base_id) qui prend le pas sur celle-ci (retour d'expérience, accords
--      locaux avec une agence…).
--
--  À coller dans Supabase > SQL Editor puis Run. Idempotent : le SEED des
--  fiches communes se met à jour sur le nom (les fiches personnelles ne sont
--  jamais touchées).
-- ============================================================

create table if not exists public.guide_pret_assureurs (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  owner_id           uuid references auth.users(id) on delete cascade,               -- null = fiche commune (éditeur)
  base_id            uuid references public.guide_pret_assureurs(id) on delete cascade, -- copie personnalisée d'une fiche commune
  nom                text not null,
  alias              text,           -- autres graphies rencontrées sur les dossiers, séparées par des virgules
  contrat            text,           -- nom du contrat / de la garantie
  inclusion          text not null default 'inconnu', -- inclus | option | selon_formule | inconnu
  formules           text,           -- détail par formule / niveau d'option
  prix_option        text,
  duree_panne        int,            -- jours
  duree_accident     int,
  duree_vol          int,
  duree_incendie     int,
  duree_max          int,
  categorie          text,           -- catégorie du véhicule fourni (A, B, équivalente…)
  plafond_jour       numeric(10,2),  -- €/jour remboursés si l'assisteur ne fournit pas de véhicule
  plafond_detail     text,
  immobilisation_min text,           -- seuil de déclenchement (> 24 h, > 5 h de main-d'œuvre…)
  garage_agree       text not null default 'inconnu', -- obligatoire | avantage | non | inconnu
  conditions         text,
  exclusions         text,
  facturation_garage text,           -- le garage peut-il facturer l'assureur ?
  assisteur          text,
  assisteur_tel      text,
  sources            text,           -- une URL par ligne
  fiabilite          text not null default 'site', -- cg | site | comparateur
  verifie_le         date,
  notes              text,           -- retour d'expérience du garage
  actif              boolean not null default true
);

-- Une seule fiche commune par assureur (le seed se met à jour dessus).
create unique index if not exists guide_pret_assureurs_commun_nom_idx
  on public.guide_pret_assureurs (lower(nom)) where owner_id is null;
create index if not exists guide_pret_assureurs_owner_idx on public.guide_pret_assureurs (owner_id);
create index if not exists guide_pret_assureurs_base_idx  on public.guide_pret_assureurs (base_id) where base_id is not null;

alter table public.guide_pret_assureurs enable row level security;

-- Lecture : fiches communes + ses propres fiches.
drop policy if exists guide_pret_select on public.guide_pret_assureurs;
create policy guide_pret_select on public.guide_pret_assureurs
  for select to authenticated
  using (owner_id is null or owner_id = auth.uid());

-- Écriture : ses propres fiches ; les fiches communes seulement pour l'éditeur
-- (même liste que NEXT_PUBLIC_ADMIN_EMAILS — à compléter ici si elle change).
drop policy if exists guide_pret_insert on public.guide_pret_assureurs;
create policy guide_pret_insert on public.guide_pret_assureurs
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    or (owner_id is null and lower(coalesce(auth.jwt() ->> 'email', '')) in ('contact.ideaforma@gmail.com'))
  );

drop policy if exists guide_pret_update on public.guide_pret_assureurs;
create policy guide_pret_update on public.guide_pret_assureurs
  for update to authenticated
  using (
    owner_id = auth.uid()
    or (owner_id is null and lower(coalesce(auth.jwt() ->> 'email', '')) in ('contact.ideaforma@gmail.com'))
  )
  with check (
    owner_id = auth.uid()
    or (owner_id is null and lower(coalesce(auth.jwt() ->> 'email', '')) in ('contact.ideaforma@gmail.com'))
  );

drop policy if exists guide_pret_delete on public.guide_pret_assureurs;
create policy guide_pret_delete on public.guide_pret_assureurs
  for delete to authenticated
  using (
    owner_id = auth.uid()
    or (owner_id is null and lower(coalesce(auth.jwt() ->> 'email', '')) in ('contact.ideaforma@gmail.com'))
  );

comment on table public.guide_pret_assureurs is 'Guide véhicule de prêt : conditions de prise en charge par assureur (fiches communes de l''éditeur + fiches personnelles des garages).';

-- ------------------------------------------------------------
--  SEED des fiches communes — recherche documentaire du 18/09/2026
--  (conditions générales et pages produits publiques ; « comparateur » =
--  chiffre non retrouvé dans les CG, à confirmer avec le client).
-- ------------------------------------------------------------
insert into public.guide_pret_assureurs
  (nom, alias, contrat, inclusion, formules, prix_option,
   duree_panne, duree_accident, duree_vol, duree_incendie, duree_max, categorie,
   plafond_jour, plafond_detail, immobilisation_min, garage_agree,
   conditions, exclusions, facturation_garage, assisteur, assisteur_tel, sources, fiabilite, verifie_le)
values
(
  'AXA', 'axa france iard, axa assurances, direct axa',
  'Mon Auto / Auto Référence — « Véhicule de prêt » (art. 3.18) et « Véhicule de remplacement » (art. 3.15, AXA Assistance)',
  'selon_formule',
  'Véhicule de prêt gratuit (petite citadine, catégorie A) pendant les réparations : inclus dans toutes les formules Mon Auto, en option avec les Packs Équilibre ou Confort en Auto Référence — UNIQUEMENT si la réparation est confiée à un réparateur du réseau partenaire AXA. Véhicule de remplacement fourni par AXA Assistance (catégorie B) si la garantie figure aux conditions particulières.',
  null,
  7, 15, 30, 15, 30, 'Catégorie B (assistance) / catégorie A (prêt réseau partenaire)',
  40, '40 €/jour si AXA Assistance ne peut pas fournir de véhicule localement (numéro de dossier préalable indispensable)',
  'Véhicule non roulant, plus de 5 h de réparation et plus de 24 h d''immobilisation ; vol non retrouvé sous 24 h ; demande dans les 72 h',
  'avantage',
  'Appeler AXA Assistance AVANT toute intervention pour obtenir un numéro de dossier (seul justificatif de prise en charge). Vol : véhicule tant qu''il n''est pas retrouvé, 30 jours maximum ; vol retrouvé endommagé = accident (15 j). Restitution à l''agence de mise à disposition, conditions des loueurs à respecter. Le prêt gratuit disparaît si le client choisit un réparateur non partenaire ; le véhicule de remplacement d''assistance reste dû hors réseau.',
  'Service Auto à Domicile exclu en cas d''expertise conservatoire, grêle, inondation, catastrophe naturelle ou tentative de vol. Frais engagés sans numéro de dossier non remboursés.',
  'Aucune facturation directe prévue par un garage hors réseau. Seule voie : 40 €/jour si l''assisteur ne fournit pas de véhicule, avec numéro de dossier préalable. Hors réseau, facturer la location au client et faire valoir le préjudice d''immobilisation (accident non responsable).',
  'AXA Assistance', '01 55 92 26 92',
  E'https://www.index-assurance.fr/fichiers/cg/conditions-generales-mon-auto-axa-juin-2023.pdf\nhttps://www.index-assurance.fr/fichiers/cg/conditions-generales-axa-auto-reference-juin-2023.pdf\nhttps://www.axa.fr/assurance-auto/garages-partenaires.html',
  'cg', '2026-09-18'
),
(
  'Allianz', 'allianz iard, allianz france',
  'Assurance auto Allianz — « Pack Mobilité classique » / « Pack Mobilité plus » (dépannage 0 km + véhicule de remplacement)',
  'option',
  'Pack Mobilité classique en option sur toutes les formules (C1, C1+, C2, C3) : panne 8 j, accident / incendie / tentative de vol 15 j, vol 30 j. Pack Mobilité plus en option sur la formule Tous risques C3 uniquement : 30 jours quel que soit l''événement. Sans pack : assistance de base seulement (véhicule de location si immobilisation > 2 jours, 48 h en cas de vol à plus de 25 km).',
  'Non public (selon profil)',
  8, 15, 30, 15, 30, 'Même catégorie que le véhicule assuré, limitée à la catégorie D ; utilitaire jusqu''à 12 m³',
  null, 'Pas d''indemnité journalière trouvée ; à défaut de véhicule : livraison de courses ou taxi pour les enfants, 100 € TTC',
  'Non précisé dans les extraits lus (accord préalable obligatoire)',
  'obligatoire',
  'Réparation dans un garage agréé Allianz ; un garage hors réseau nécessite l''accord préalable d''Allianz. Accord préalable OBLIGATOIRE d''Allianz Assistance avant d''engager des frais : aucun remboursement sans validation. Véhicule assuré sans franchise et kilométrage illimité (à confirmer sur les DG). Les garanties du contrat sont transférées automatiquement sur le véhicule mis à disposition par un garage agréé Allianz.',
  'Non détaillées dans les extraits lus.',
  'Aucun mécanisme de remboursement sur facture d''un garage identifié : tout passe par l''accord préalable d''Allianz Assistance.',
  'Allianz Assistance (AWP France, ex-Mondial Assistance)', '0 800 103 105',
  E'https://espaceclient.allianz.fr/pdf/tarification/DG/auto/AUTO-MA/COM21405-V0721.pdf\nhttps://www.allianz.fr/assurance-particulier/vehicules/assurance-auto.html\nhttps://www.allianz.fr/assurance-particulier/assistance.html',
  'site', '2026-09-18'
),
(
  'MAIF', 'maif assurances, filia maif',
  'Contrat Vam — « Le service véhicule de remplacement » / option mobilité',
  'selon_formule',
  'Plénitude : inclus — prêt d''un véhicule pendant toute la durée des réparations en cas d''accident, 20 jours en cas de vol. Différence : en option (« Assistance panne 0 km, véhicule de remplacement en cas d''accident ou de vol », 7 j accident). Initiale et Essentiel : non proposé. PANNE : toujours en option, même en Plénitude (7 j).',
  'Non public',
  7, 7, 20, null, 20, 'Non précisé dans les CG lues',
  null, null,
  'Immobilisation pour réparations suite à un événement couvert ; durée fixée par l''expert mandaté par la MAIF',
  'avantage',
  'Un expert MAIF évalue les dommages et détermine la durée nécessaire aux réparations. Réparateur partenaire MAIF : prêt gratuit d''un véhicule dans les limites du contrat, avec tarif préférentiel si prolongation. Assistance de base : 0 km en cas d''accident, 50 km en cas de panne (0 km en option ou inclus en Plénitude).',
  'Véhicules de collection exclus. Autres exclusions non extraites.',
  'Aucune clause de remboursement sur justificatif d''une location fournie par un garage non partenaire identifiée.',
  'MAIF Assistance (IMA)', '0 800 875 875',
  E'https://www.maif.fr/maiffr/documents/pdf/documentation-contractuelle/mobilite/conditions-generales-assurance-auto-vam.pdf\nhttps://www.maif.fr/vehicule-mobilite/assurance-auto\nhttps://www.maif.fr/vehicule-mobilite/reparateurs-partenaires',
  'cg', '2026-09-18'
),
(
  'MACIF', 'macif assurances, macif mutualité',
  'Macif Auto — « Véhicule de prêt » (partie 14 des CG, version 01/2026)',
  'option',
  'Option sur les formules Économique, Élargie et Protectrice (catégorie B) ; incluse en formule Confort (catégorie équivalente au véhicule assuré, jusqu''à D). Événement accidentel (hors vol total) : 15 jours consécutifs ; vol total : 30 jours ; panne : 7 jours.',
  'Non public',
  7, 15, 30, 15, 30, 'Catégorie B ; Confort : catégorie équivalente jusqu''à D',
  40, '40 €/jour (60 € en Confort) d''indemnité forfaitaire si Macif Assistance ne peut pas fournir de véhicule, dans la limite des durées',
  'Immobilisation de plus de 24 h ET réparations de plus de 3 h de main-d''œuvre (barème constructeur), ou vol',
  'non',
  'Véhicule fourni par des agences de location via Macif Assistance. Conducteur : au moins 21 ans, permis de plus d''un an, caution demandée par le loueur. France métropolitaine et UE. Aucune limite de kilométrage mentionnée. Pas de condition de réparateur agréé trouvée.',
  'Carburant du véhicule prêté ; frais de location engagés de votre propre initiative ou au-delà de la prise en charge de Macif Assistance.',
  'NON prévue : une location engagée à l''initiative du client (ou du garage) est expressément exclue. Seule l''indemnité forfaitaire 40/60 €/jour existe, si l''assisteur ne fournit pas de véhicule.',
  'Macif Assistance (IMA)', '0 800 774 774',
  E'https://www.macif.fr/files/live/sites/maciffr/files/conditions_generales_vehicules/CG_Auto.pdf\nhttps://www.macif.fr/assurance/particuliers/assurance-auto-moto-scooter/assurance-automobile/voiture-pret-assurance',
  'cg', '2026-09-18'
),
(
  'Matmut', 'matmut assurances, matmut mutualité',
  'Auto 4D — « Véhicule de remplacement » (article 25), niveau 1 ou niveau 2',
  'option',
  'Option niveau 1 ou 2 sur Tiers, Tiers-Vol-Incendie et Tous risques ; niveau 2 INCLUS en Tous risques Plus. Prérequis : option « Assistance panne 0 km ». Niveau 1 : accident / incendie / tentative de vol / vandalisme / événement climatique 10 j, vol 20 j, panne 5 j. Niveau 2 : 20 j / 30 j / 10 j. Les durées ci-contre sont celles du niveau 1.',
  'Non public',
  5, 10, 20, 10, 30, 'Catégorie similaire au véhicule assuré (voiture, utilitaire, camionnette)',
  30, '30 €/jour d''immobilisation sur justificatifs, à défaut de mise à disposition d''un véhicule par Matmut Assistance',
  'Véhicule non roulant établi par expertise ; accord préalable Matmut ; demande dans les 30 jours suivant le sinistre',
  'non',
  'Aucune franchise. Prolongation sans frais si un conducteur non responsable est identifié. Pas d''obligation de réparateur agréé identifiée. Assistance de base : 0 km accident, 50 km panne (0 km en option).',
  'Voiturettes exclues ; garantie non acquise au locataire du véhicule, lors d''un essai en vue de vente ou en transfert temporaire ; l''immobilisation doit résulter d''un événement garanti par la formule.',
  'Pas de facturation directe. Remboursement au client à concurrence de 30 €/jour sur justificatifs, uniquement si Matmut Assistance ne fournit pas de véhicule : le garage peut être réglé via le client dans cette limite (interprétation, à confirmer).',
  'Matmut Assistance (IMA)', '0 800 30 20 30',
  E'https://www.matmut.fr/services-en-ligne/doc/CG/cgauto4dmatmut.pdf\nhttps://www.matmut.fr/assurance/auto/garantie/vehicule-remplacement',
  'cg', '2026-09-18'
),
(
  'Groupama', 'groupama assurances, groupama méditerranée, groupama rhône-alpes auvergne, groupama centre-atlantique, groupama loire bretagne, groupama grand est, groupama nord-est, groupama paris val de loire, groupama océan indien, groupama antilles guyane',
  'Conduire Auto — « Auto Presto » (inclus) / « Auto Presto Privilège » (option)',
  'selon_formule',
  'Auto Presto (prêt suite à accident avec réparations) prévu dans toutes les formules ; en Mini et Éco : seulement en cas d''accident NON responsable avec tiers identifié. Auto Presto Privilège (panne, vol, vandalisme, véhicule épave) en option sur Mini / Éco / Confort, inclus en formule Mobilité. Accident : pendant toute la durée des réparations ; vol : 30 jours ; panne : 7 jours (comparateur, non confirmé CG).',
  'Non public',
  7, null, 30, null, 30, 'Catégorie A (citadine) ; catégorie choisie à la souscription en Privilège (hors luxe, monospaces, utilitaires)',
  null, 'Option « indemnité journalière pour location » citée sur groupama.fr, montants non trouvés',
  'Non trouvé',
  'obligatoire',
  'Réparations chez un garage partenaire Groupama (réseau ~1 500 garages, franchise et avance de frais gérées par Groupama). Livraison du véhicule dans un rayon de 30 km autour du lieu de l''accident. Garanties transférées sur le véhicule de prêt, 30 jours maximum. Accident : prêt pendant toute la durée des réparations.',
  'Luxe, monospaces et utilitaires exclus de la catégorie choisie ; accident responsable non couvert en Mini / Éco sans option.',
  'En Auto Presto, Groupama règle directement le réparateur partenaire ; « aucun coût supplémentaire ne doit figurer sur la facture de réparation ». Hors réseau : pas de modalité trouvée.',
  'Groupama Assistance', '01 45 16 66 66',
  E'https://www.groupama.fr/assurance-auto/assurance-auto-presto/\nhttps://www.groupama.fr/assurance-auto/conseils/vehicule-de-courtoisie/\nhttps://www.elly-assurance.fr/wp-content/uploads/2022/05/conditions-generales-assurance-auto-groupama.pdf',
  'site', '2026-09-18'
),
(
  'MAAF', 'maaf assurances, maaf vie',
  'Auto Assurance Multirisque — « Véhicule de prêt jusqu''à 3 jours » (art. 10.5) / « jusqu''à 20 jours » (art. 10.6)',
  'selon_formule',
  'Tous Risques Confort : 3 jours inclus (20 jours en option). Tous Risques Confort+ et Leasing+ : 20 jours inclus. Tiers Éco / Essentiel / Essentiel+ : en option, vendue dans un pack (pas de souscription isolée). Version 20 jours : panne 7 j, accident / événement garanti 15 j, vol 20 j (comparateurs, non confirmé CG). Version 3 jours : 3 jours quel que soit l''événement.',
  'Non public',
  7, 15, 20, 15, 20, 'Non précisé',
  null, null,
  'Non lisible dans les CG (art. 10.5 / 10.6)',
  'inconnu',
  'Transfert des garanties sur le véhicule de prêt pendant l''immobilisation, 30 jours maximum (art. 1.5). Garantie non souscriptible pour un quadricycle. Vérifier avec le client la version souscrite (3 ou 20 jours).',
  'Non trouvées (hors quadricycles).',
  'Non trouvé.',
  'MAAF Assistance', '0 800 16 17 18',
  E'https://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Vehicule/CG/CG_assurance_auto_18133.pdf\nhttps://www.maaf.fr/fr/files/live/sites/maaf/files/DOCUMENTS/Vehicule/Tableaux_de_garanties/tab_garanties_auto_pri_maaf.pdf\nhttps://www.faq-maaf.fr/contenu/vehicule/comment-beneficier-d-un-vehicule-de-remplacement',
  'comparateur', '2026-09-18'
),
(
  'GMF', 'gmf assurances, la garantie mutuelle des fonctionnaires',
  'Auto Pass — « Véhicule de remplacement » + option « Extension prêt de véhicule »',
  'selon_formule',
  'Tiers Confort et Médiane Confort : pas de véhicule de remplacement. Tous Risques Confort : inclus 3 jours maximum dès le jour de l''événement, extension en option. Tous Risques Confort+ : extension incluse. Extension : panne 7 j, accident 14 j, vol 40 j.',
  'Non public',
  7, 14, 40, null, 40, 'Non précisé',
  null, null,
  'Véhicule remorqué par GMF Assistance, immobilisé plus de 24 h et nécessitant au moins 5 h de main-d''œuvre',
  'inconnu',
  'Le véhicule doit avoir été remorqué par les services de la GMF. Vol : dépôt de plainte préalable. Assistance 0 km incluse (accident, panne, vol). Transfert des garanties sur le véhicule prêté 30 jours maximum (hors panne mécanique). Pas d''obligation de garage partenaire mentionnée.',
  'Non trouvées (convention d''assistance non accessible).',
  'Non trouvé : véhicule fourni via l''assistance (remorquage GMF = condition d''accès).',
  'GMF Assistance', '0 800 00 12 13',
  E'https://www.gmf.fr/vehicules/assurance-auto-moto/assurance-autopass\nhttps://www.index-assurance.fr/fichiers/cg/conditions-generales-gmf-auto-juin-2023.pdf',
  'site', '2026-09-18'
),
(
  'Generali', 'generali iard, generali france, l''équité',
  'L''Auto Generali — « Option Véhicule de Remplacement Eco » / « Étendu » (Europ Assistance)',
  'option',
  'En option dans les trois formules (Tiers, Tiers Étendu, Tous Risques). Étendu : panne 8 j, accident 15 j, vol 40 j (49 j cités sur une page generali.fr), véhicule de même catégorie sans dépasser E. Eco : citadine pendant 5 jours maximum. Réparation dans un garage agréé Generali : véhicule de courtoisie possible pendant les réparations, selon disponibilités du garage.',
  'Non public',
  8, 15, 40, null, 40, 'Même catégorie que le véhicule assuré, maximum E (Eco : citadine)',
  null, null,
  'Non trouvé ; remorquage organisé par Europ Assistance préalable',
  'avantage',
  'Remorquage organisé par Europ Assistance, puis appel pour la mise à disposition. Vol : déclaration préalable aux autorités. France + pays carte verte.',
  'Non trouvées (texte des DG p. 33-34 non lisible).',
  'Non trouvé. Le véhicule de courtoisie du garage agréé relève du garage, sans prise en charge financière mentionnée.',
  'Europ Assistance', '01 41 85 84 83',
  E'https://www.generali.fr/assurance-auto/avantages-assistance/\nhttps://www.generali.fr/aide/user-question/assistance-vehicule-remplacement\nhttps://www.mascotte-assurances.fr/wp-content/uploads/2024/06/GA1403L.pdf',
  'site', '2026-09-18'
),
(
  'Direct Assurance', 'direct assurances, directassurance',
  '« Véhicule de prêt pendant les réparations » (art. 41) / « Extension véhicule de prêt » (art. 5.6)',
  'selon_formule',
  'Base : véhicule de prêt pendant les réparations dans un garage PARTENAIRE Direct Assurance (Packs Tranquillité / Sérénité, disponibles sur toutes les formules — périmètre à confirmer). Extension véhicule de prêt : 3,90 €/mois, valable quel que soit le garage, incluse en Tous Risques Maxi : panne 7 j (2 pannes/an, carence 30 j), accident / incendie / catastrophe naturelle 15 j, véhicule économiquement irréparable 15 j, vol non retrouvé sous 24 h 30 j.',
  'Extension : 3,90 €/mois',
  7, 15, 30, 15, 30, 'Catégorie A ou B (citadine 4-5 places), kilométrage illimité',
  null, null,
  'Immobilisation de plus de 24 h ; réclamation sous 72 h',
  'avantage',
  'Appel obligatoire au service Assistance (AXA Assistance) ; véhicule fourni sous 24 h par une agence de location partenaire ; conditions des loueurs (âge, permis, carte bancaire) ; restitution à l''agence d''origine, plein fait. Base art. 41 : pas de prêt entre l''accident et le début des réparations, réparation en garage partenaire obligatoire.',
  'Vandalisme, crevaison, erreur de carburant, perte de clé ; réparation hors garage agréé (pour la base art. 41).',
  'Non trouvé : prêt fourni par le garage partenaire (base) ou location organisée par l''assisteur (extension).',
  'AXA Assistance', '01 55 92 27 20',
  E'https://www.direct-assurance.fr/nos-assurances/extension-vehicule-pret\nhttps://aide.direct-assurance.fr/comment-intervient-le-vehicule-de-pret-etendu\nhttps://www.direct-assurance.fr/assurance-auto/fonctionnement-assurance-voiture/que-propose-direct-assurance-comme-vehicule-de-pret',
  'cg', '2026-09-18'
),
(
  'L''olivier Assurance', 'l''olivier, lolivier, olivier assurance, admiral',
  '« Véhicule de remplacement » — Assistance 0 km des packs / option « Assistance + »',
  'option',
  'Pas dans les formules de base. Inclus dans les packs optionnels (Pack Assistance dès 5 €/mois, Pack Sécurité, Pack Premium dès 12 €/mois) : panne 5 j, accident 7 j, vol 7 j, incendie 7 j. « Assistance + » (+2,50 €/mois, en complément d''un pack) : panne 8 j, accident 15 j, vol 30 j, incendie 15 j. Les durées ci-contre sont celles des packs.',
  'Packs dès 5 €/mois ; Assistance + : +2,50 €/mois',
  5, 7, 7, 7, 30, 'Non précisé',
  null, null,
  'Véhicule remorqué ou dépanné par Europ Assistance et immobilisé plus de 48 h consécutives, en France',
  'avantage',
  'Déclenchement par le remorquage Europ Assistance. Garages partenaires L''olivier : pas d''avance de frais, véhicule de remplacement prêté pendant les réparations, véhicule rendu nettoyé.',
  'Extension des garanties au véhicule de prêt non acquise pour vandalisme, crevaison, erreur de carburant, perte de clé, réparation hors garage professionnel.',
  'Non trouvé.',
  'Europ Assistance', 'Non trouvé (standard L''olivier : 01 84 022 022)',
  E'https://www.lolivier.fr/assurance-auto/pret-vehicule-de-remplacement\nhttps://www.lolivier.fr/medias/uploads/2025/11/dgloa202511.pdf\nhttps://www.lolivier.fr/tout-sur-lolivier/nos-garages-partenaires',
  'site', '2026-09-18'
),
(
  'Pacifica (Crédit Agricole)', 'pacifica, crédit agricole, credit agricole assurances, ca assurances',
  '« Assistance au véhicule avec véhicule de remplacement » (garantie modulable)',
  'selon_formule',
  'D''après les comparateurs (CG non publiées en ligne) : véhicule de remplacement 30 jours inclus dès la formule Tiers Intégrale, en option en Tous Risques Initial. La panne relève d''une option « Panne » distincte.',
  'Non public',
  null, 30, 30, null, 30, 'Non précisé',
  null, null,
  'Non trouvé',
  'inconnu',
  'Assistance 0 km avec la garantie véhicule de remplacement (assistance de base : 25 km). Réseau de garages agréés Pacifica existant. DEMANDER LES CONDITIONS PARTICULIÈRES AU CLIENT : les CG complètes ne sont pas publiées.',
  'Non trouvées.',
  'Non trouvé.',
  'Mondial Assistance (à vérifier sur la carte verte)', '0 800 81 08 12',
  E'https://www.credit-agricole.fr/content/dam/assetsca/master/public/commun/documents/ass_auto_2019.pdf\nhttps://selectra.info/assurance/assureurs/credit-agricole-assurance/assurance-auto',
  'comparateur', '2026-09-18'
),
(
  'Eurofil (Abeille Assurances)', 'eurofil, abeille assurances, abeille iard, aviva',
  '« Véhicule de remplacement en cas d''accident ou de vol » / options « Assistance intégrale » et « Assistance maximale »',
  'selon_formule',
  'Base (Tiers + bris de glace + vol, Tous risques, Tous risques maxi) : 8 jours en cas d''accident avec remorquage, tentative de vol ou vol. Assistance intégrale (6 €/mois) : accident 21 j, vol 40 j. Assistance maximale (7,50 €/mois) : accident / incendie 21 j, vol 40 j, panne 8 j, véhicule de catégorie identique. Les durées ci-contre sont celles de la base.',
  'Assistance intégrale : 6 €/mois ; maximale : 7,50 €/mois',
  null, 8, 8, null, 40, 'Catégorie A ou B (base, intégrale) ; identique en maximale, sauf indisponibilité',
  null, null,
  'Immobilisation ET remorquage du véhicule (48 h selon la FAQ)',
  'non',
  'Déclenchement en cas d''immobilisation et remorquage suite à accident ou tentative de vol, ou en cas de vol. CG : les garanties RC peuvent être transférées sur un véhicule de catégorie similaire loué ou emprunté auprès du professionnel qui répare, 30 jours consécutifs maximum (le client reste couvert au volant de votre véhicule). Réseau de 2 300 réparateurs agréés, sans conditionnement du véhicule de remplacement au réseau trouvé.',
  'Exclusions communes aux trois options (section 8 des CG), détail non lisible.',
  'Non trouvé.',
  'Eurofil Assistance', '02 36 16 80 55 (à vérifier — probablement service client)',
  E'https://www.eurofil.com/documents/auto/Conditions-Generales-Assurance-Auto.pdf\nhttps://www.eurofil.com/assurances/assurance-auto/produits-risques.html\nhttps://www.eurofil.com/assurances/assurance-auto/faq-produit.html',
  'site', '2026-09-18'
),
(
  'Crédit Mutuel / CIC (ACM)', 'acm, assurances du crédit mutuel, credit mutuel, cic, cic assurances, acm iard',
  'Assurance auto ACM — garantie « Assistance » (remorquage, dépannage et véhicule de remplacement)',
  'selon_formule',
  'Assistance en option en formule Tiers, incluse en Tiers étendue, Tous risques standard et Tous risques optimale (page CIC) ; un comparateur indique le véhicule de remplacement « en option » — à vérifier sur les conditions particulières. Durées (comparateur) : 30 jours en panne, accident et vol. Attention : Crédit Mutuel de Bretagne / Sud-Ouest (Arkéa) = Suravenir Assurances, contrat différent (inclus en Tous risques, option en Tiers ; Europ Assistance 0 970 809 417).',
  'Non public',
  30, 30, 30, null, 30, 'Non précisé',
  null, 'À l''étranger : indemnisation jusqu''à 250 € pour un véhicule de remplacement',
  'Non trouvé',
  'inconnu',
  'CG non publiées en ligne : DEMANDER LES CONDITIONS PARTICULIÈRES AU CLIENT. Réseau de garages agréés Crédit Mutuel existant.',
  'Non trouvées.',
  'Non trouvé.',
  'Mondial Assistance (comparateur)', 'Non trouvé',
  E'https://www.cic.fr/fr/particuliers/assurance/assurance-auto.html\nhttps://www.creditmutuel.fr/fr/particuliers/assurance/assurance-auto.html\nhttps://www.index-assurance.fr/credit-mutuel-auto-9420.html',
  'comparateur', '2026-09-18'
),
(
  'Leocare', 'leocare assurance, léocare',
  'Assurance auto Leocare — « Véhicule de prêt » de la garantie assistance',
  'inclus',
  'Véhicule de prêt compris dans toutes les formules (Tiers, Intermédiaire, Tous risques), sans surcoût trouvé : panne 5 j (8 j selon le blog), accident 8 j, vol 20 j, crevaison 3 j. Alternative : remboursement jusqu''à 250 € de frais de déplacement (taxi, VTC) si le client ne souhaite pas de véhicule.',
  'Inclus',
  5, 8, 20, null, 20, 'Catégorie A (citadine) ; surclassement payant possible',
  null, '250 € de frais de déplacement en alternative au véhicule',
  'Non trouvé ; mise à disposition dans les 24 h',
  'non',
  'Assistance 0 km. Remorquage dans le garage du choix du client (plafonds 300 € autoroute / 200 € ailleurs) ; véhicule déposé gratuitement au garage le plus proche du sinistre. Pas d''obligation de garage partenaire trouvée.',
  'Frais de réparation, pannes à répétition, panne d''essence, crevaisons, immobilisation pour intempéries.',
  'Non trouvé.',
  'Europ Assistance (numéro sur le mémo véhicule assuré)', 'Non publié',
  E'https://leocare.eu/fr/assurance-auto-en-ligne/couverture/assistance-auto/vehicule-de-remplacement/\nhttps://leocare.eu/fr/assurance-auto-en-ligne/couverture/assistance-auto/',
  'site', '2026-09-18'
)
on conflict (lower(nom)) where owner_id is null do update set
  alias = excluded.alias, contrat = excluded.contrat, inclusion = excluded.inclusion, formules = excluded.formules,
  prix_option = excluded.prix_option, duree_panne = excluded.duree_panne, duree_accident = excluded.duree_accident,
  duree_vol = excluded.duree_vol, duree_incendie = excluded.duree_incendie, duree_max = excluded.duree_max,
  categorie = excluded.categorie, plafond_jour = excluded.plafond_jour, plafond_detail = excluded.plafond_detail,
  immobilisation_min = excluded.immobilisation_min, garage_agree = excluded.garage_agree, conditions = excluded.conditions,
  exclusions = excluded.exclusions, facturation_garage = excluded.facturation_garage, assisteur = excluded.assisteur,
  assisteur_tel = excluded.assisteur_tel, sources = excluded.sources, fiabilite = excluded.fiabilite,
  verifie_le = excluded.verifie_le, updated_at = now();
