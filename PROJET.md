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
