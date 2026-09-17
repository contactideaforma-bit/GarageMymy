# GarageMYMY — Mémo projet

Plateforme de gestion pour une **carrosserie** : centralise le suivi des dossiers de sinistres,
de l'import du rapport d'expertise jusqu'à la facture, avec clients, véhicules, planning et agenda.

---

## Comment on travaille

- **Stack** : Next.js 14 (App Router) + Tailwind + Supabase (base + stockage) + API Claude (extraction) + déploiement Vercel.
- **Workflow** : Claude code les fonctionnalités, puis colle dans la conversation les **commandes `git` à exécuter dans VS Code**. L'utilisateur teste / déploie.
- **Repo GitHub** : `contactideaforma-bit/GarageMymy` · dossier local : `/Users/moi/GarageMYMY`.
- **Déploiement** : push GitHub → Vercel redéploie automatiquement.
- ⚠️ Le build n'est **pas** lancé côté Claude (npm bloqué dans son environnement) : c'est le build Vercel / `npm run dev` local qui valide la compilation. Bien relire le code avant de pousser.
- **Langue** : interface 100 % en français.
- À chaque nouvelle table/colonne, fournir le SQL à coller dans **Supabase → SQL Editor** (fichiers dans `supabase/`).

### Variables d'environnement (`.env.local` + Vercel)
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=sk-ant-...        # extraction du rapport
ANTHROPIC_MODEL=claude-sonnet-4-6   # optionnel
# À venir : RESEND_API_KEY (envoi de mails)
```

### Migrations SQL (à exécuter dans l'ordre si base neuve)
`schema.sql` contient tout pour une base neuve. Sinon, migrations cumulatives :
`migration_documents.sql` → `migration_profil_clients.sql` → `migration_v2.sql` → `migration_v3.sql` → `migration_v4.sql`.

---

## Ce qui est déjà fait

- **Thème aurora** translucide (glassmorphism) + **mode clair / sombre** (toggle en bas de la barre).
- **Responsive mobile** : barre latérale en tiroir + menu burger ☰ (composant `AppShell`).
- **Tableau de bord** : véhicules présents au garage (compteur + visuel), dossiers en cours, total facturé du mois, événements à venir.
- **Sinistres** : liste + recherche, fiche dossier complète, **pipeline de statut**
  (Nouveau → Expertise → Devis → Réparation → Facturé → Véhicule rendu → Payé → Clôturé), édition / suppression, événements liés.
- **Import rapport (IA Claude)** : dépôt du PDF → extraction véhicule / sinistre / client / expert / assurance + **lignes du chiffrage** → dossier pré-rempli. Aussi dispo dans le formulaire d'ajout (« Analyser et pré-remplir »).
- **Devis & Factures** générés **automatiquement** depuis le rapport (modifiables) + **export PDF** à la charte du garage (en-tête logo/infos, pied légal, TVA, totaux). Onglets dédiés.
- **Profil du garage** (`/profil`) : coordonnées, SIRET, TVA, IBAN/BIC, mentions, logo, facture type.
- **Annuaire** (`/annuaire`) : 3 onglets **Clients · Assurances · Experts**, alimentés auto depuis les dossiers + ajout/édition manuels (commentaire) + recherche.
- **Véhicules** (`/vehicules`) : véhicules des dossiers + hors dossier, case **« au garage »**, filtre présents/absents, recherche.
- **Planning de réparations** (`/planning`) : période + réparateur par dossier, vue semaine, planification.
- **Agenda** (`/agenda`) : vue **semaine / mois**, navigation passé-futur, **+ RDV** (type client/expert, dossier, date, heure, motif, interlocuteur).
- Fiche dossier enrichie : coordonnées cabinet d'expert, expert en charge, assurance ; planning réparation.

### Ajouté v12.3 — Fiche véhicule & flotte hors garage
- **Migration** `supabase/migration_v67.sql` : colonnes fiche sur `flotte_vehicules` (type de contrat, n° de police, dates de contrat, VIN, CT, km, notes, `hors_garage`, `titulaire_cg`) + tables `flotte_documents`, `flotte_entretiens`, `flotte_mises_a_dispo` (prêt OU location, liée à un dossier sinistre / une fiche client / un transfert de garantie), `flotte_photos` (départ / retour). RLS owner_id partout.
- **Fiche véhicule** `/flotte/[id]` (`src/app/flotte/[id]/page.tsx`) : mentions importantes (assurance, contrat, police, échéances, CT), notes, panneaux `MiseADispoPanel` (Prêter / Louer → `MiseADispoModal` pré-rempli depuis le dossier ou le client, CG modifiables, signature `SignerModal`, photos avant/après `PhotosMadModal` avec comparaison, retour `RetourModal` km/carburant/état, **« qui avait le véhicule le … ? »**), `FlotteDocumentsPanel` (carte grise, assurance, CNI, CT, photos, PV… avec expiration), `FlotteEntretiensPanel` (carnet + prochain passage). Composants dans `src/components/flotte/`, formulaire `VehiculeForm`.
- **Liste** `/flotte` → `FlotteListe` (un véhicule créé ouvre sa fiche ; boutons Prêter / Louer / Fiche / Retour). **`/flotte/hors-garage`** : même liste filtrée `hors_garage = true`, visible uniquement pour les comptes de `COMPTES_FLOTTE_HORS_GARAGE` (`lib/flotte.ts`, aujourd'hui `latelierdesaintjoseph@gmail.com`) — entrée Sidebar conditionnelle.
- **Helpers** : `lib/flotte.ts` (`detenteurA`, `phraseDetenteur`, `synchroniserStatutVehicule` qui maintient `loue/locataire` pour l'ancien panneau, dépôt documents/photos), `lib/pret.ts` (`clausesMiseADispo`, `conducteurDepuisDossier/Client`, `defautsMiseADispo`), `lib/pdf.ts` (`buildContratMiseADispoPdf` + aperçu / téléchargement / base64).
- **MY-MY** : contexte enrichi (flotte + mises à dispo), réponse locale « qui avait la AB-123-CD le 12/08 ? » / « PV du 3 septembre » (`reponseFlotte`, `dateDansPhrase`, `vehiculeDansPhrase`) et résumé IA avec l'historique par véhicule.
- Le prêt créé depuis la fiche dossier (`TransfertGarantiePanel`) crée aussi la mise à disposition dans la fiche véhicule (et la clôture à la suppression).

### Ajouté v13.0 — Reprise des dossiers en cours : import multi-documents & facture extérieure
- **Besoin** : un garage qui démarre a des dossiers déjà en route, avec des factures faites AILLEURS. `/import` accepte désormais **plusieurs fichiers d'un coup** (rapport + facture + carte grise + constat + PEC…) et crée UN dossier ; un rapport seul se comporte comme avant.
- **Migration** `supabase/migration_v72.sql` : `documents.fichier_path` + `documents.fichier_nom` ; `documents.origine = 'externe'` (colonne de la v54). Fichier d'origine dans le bucket privé `pieces` (`<owner>/<dossier>/facture-externe-…pdf`, image convertie en PDF).
- **Tri automatique corrigeable** : `devinerTypeParNom` (instantané) puis `/api/trier-document` (IA ; PDF avec calque texte → seul le TEXTE est envoyé, début + fin ; scan/photo → image). La route lit aussi l'en-tête et les totaux d'une facture (PAS les lignes). Un type choisi à la main n'est jamais écrasé.
- **Facture extérieure** (`lib/reprise.ts`, `components/FactureExterne.tsx`) : numéro, dates et totaux D'ORIGINE ; jamais renumérotée ni régénérée ; statut « Envoyé » par défaut ; échéance par défaut = date + 30 j (sinon pas de relances auto) ; **déjà encaissé** à l'import → ligne `paiements` + statut payé / dossier « Payé » via `majDossierSiSolde` ; doublon de numéro refusé sur un même dossier. Écart avec le rapport SIGNALÉ, jamais bloquant.
- **`DossierForm` prop `sansDocumentsAuto`** : quand une facture extérieure est dans le lot, le chiffrage du rapport est conservé sur le dossier mais l'appli ne génère NI devis, NI facture, NI OR, NI cession, NI rappel « envoyer la facture » (doublons). Statut pré-réglé sur « Facture envoyée ».
- **Interception À LA SOURCE dans `lib/pdf.ts`** (`generateDocumentPdf`, `apercuDocumentPdf`, `documentPdfBase64`) : une facture `externe` renvoie son fichier d'origine → fiche dossier, liste des factures, emails (pièce principale et pièces jointes), retard de paiement, archive ZIP et sauvegarde suivent sans modification. `facturxBase64` refuse (facture non émise par l'appli → l'email part avec le PDF d'origine).
- **Fiche dossier** : bouton « + Facture extérieure », badge « Extérieure », « PDF » ouvre l'original sans demander le mode de règlement, « Modifier » ouvre `FactureExterneModal` (en-tête, totaux, remplacement du fichier), pas de « Signer » / « Factur-X » / « Acquittée » ; la suppression efface aussi le fichier. `archive.ts` purge le fichier d'origine s'il est bien entré dans le ZIP.
- **Page Import** : bilan après création (« Ouvrir le dossier » / « Dossier suivant → ») ; un rangement raté (facture ou pièce) n'annule pas le dossier, il est listé « à reprendre ».
- **Étape 2 possible** : import en série (plusieurs dossiers déposés en vrac, regroupés par immatriculation / n° de sinistre).

### Ajouté v13.1 — Prospection éditeur : recherche de garages, attribution aux commerciaux, suivi global
- **Migration** `supabase/migration_v73.sql` : `prospects.attribue_par`, `attribue_le`, `source` ('annuaire') + index `siret`, `siren`, `cp`.
- **Page** `/admin/prospection` (onglet « Prospection » d'`AdminShell`), deux onglets :
  - **Rechercher & attribuer** : zone (`13014`, `13014, 13015`, `13`, `Marseille 14e`, `Aubagne`), nom du garage, SIRET/SIREN, activité (NAF 45.20A/B par défaut). Résultats au niveau ÉTABLISSEMENT (enseigne, adresse, dirigeant, SIRET), « Libre » / « Déjà attribué · X ». Cases à cocher, « cocher les N premiers libres », « Charger la suite » (25 entreprises par page, sélection conservée), barre « Attribuer à » (commerciaux ayant un compte + « Moi (éditeur) », avec leur nombre de fiches à appeler). Après attribution les lignes passent en « déjà attribué » → on enchaîne avec le lot suivant pour un autre commercial.
  - **Suivi** : synthèse par commercial (fiches, à appeler, contactés, RDV, devis, signés, perdus, taux RDV, rappels en retard, dernier contact — un clic filtre), filtres (commercial, étape du pipeline / rappel en retard, zone CP-ville, recherche, origine attribué/créé par lui, sans activité depuis 7/14/30 j), liste avec nb de contacts, dernier résultat, prochaine action ; « Détail » = fiche + journal des contacts + documents. Actions en lot : **Réattribuer** (journal et documents suivent la fiche ; fiches signées/clientes bloquées) et **Retirer** (uniquement les fiches jamais travaillées).
- **API** `/api/admin/prospection` (ADMIN_EMAILS + service role) : GET recherche (annuaire `recherche-entreprises.api.gouv.fr` + `geo.api.gouv.fr` pour ville → codes postaux), GET `?vue=suivi` (lecture par tranches de 1000), GET `?vue=journal&prospect_id=`, POST `attribuer` / `reattribuer` / `retirer` (lots de 200 max, doublons revérifiés par SIRET à l'écriture).
- **Libs** : `lib/admin/zones.ts` (pur : `interpreterZone`, `tvaDepuisSiren`, `ACTIVITES_RECHERCHE`), `lib/admin/prospection.ts` (client). `Prospect` + `attribue_par/attribue_le/source`. `prospect_interactions` ajouté à la liste blanche de `/api/admin/donnees`.
- **Côté commercial** : rien à faire, la fiche attribuée lui appartient (owner_id) → « Mes clients », pipeline « À appeler », session d'appels ; badge « Attribué le … » tant qu'elle n'a pas été appelée. Origine = `portefeuille`.
- ⚠️ L'annuaire ne fournit PAS les téléphones : le commercial les complète. Pistes : enrichissement téléphone, contrôle de doublon quand un commercial crée lui-même une fiche déjà attribuée à un autre, notification push au commercial à l'attribution.

## Ce qu'il reste à faire

1. **Envoi de mails via Resend** (priorité suivante) : route serveur + composition depuis un dossier + **journal des mails** (table `emails` déjà créée). Nécessite `RESEND_API_KEY`.
2. **Authentification** (connexion) — actuellement accès public (anon) en RLS, à sécuriser avant usage réel.
3. Coordonnées entreprise → déjà dans le profil ; éventuellement permettre plusieurs utilisateurs / rôles.
4. Pistes : relances de paiement, comptabilité, cession de créance, statistiques avancées.

## Décisions prises

- Extraction IA = **Claude (Anthropic)**.
- PDF = **charte dans le profil** (pas de superposition sur un PDF uploadé).
- Mails = **Resend**.
- Thème = **aurora multicolore** (l'utilisateur a écarté bleu marine puis rose gris).

## Repères techniques

- Pipeline de statut : `src/lib/format.ts` (`STATUTS_ORDRE`, `STATUTS_INFO`).
- Génération PDF : `src/lib/pdf.ts` (formatage € maison sans espace insécable, marges, sauts de page).
- Extraction : `src/app/api/extract-rapport/route.ts`.
- Layout responsive : `src/components/AppShell.tsx` + `Sidebar.tsx`.
- Accès données : public/anon (RLS ouvert) — MVP, à restreindre avec l'auth.
