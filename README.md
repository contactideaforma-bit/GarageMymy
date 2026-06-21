# GarageMYMY — Plateforme de gestion carrosserie

Suivi des dossiers de sinistres pour une carrosserie.
Stack : **Next.js 14** (App Router) + **Tailwind CSS** + **Supabase** (base + stockage) + **API Claude** (extraction des rapports) + déploiement **Vercel**.

## Fonctionnalités

- **Thème aurora** translucide (glassmorphism) animé + **bascule mode clair / sombre**.
- **Tableau de bord** : dossiers en cours, agenda, total € du mois.
- **Sinistres** : liste recherchable, fiche dossier complète, **pipeline de statut** (Nouveau → Expertise → Devis → Réparation → Facturé → Payé → Clôturé), édition/suppression, événements liés.
- **Importer un rapport (IA)** : on dépose le PDF d'expertise → l'API Claude en extrait véhicule, sinistre, client, expert, assurance → dossier pré-rempli. Disponible aussi **directement dans le formulaire d'ajout** (bouton « Analyser et pré-remplir »).
- **Devis & Factures** : création depuis un dossier (lignes, TVA, totaux, statut) et **export PDF à la charte du garage**.
- **Profil du garage** (`/profil`) : coordonnées, SIRET, TVA, IBAN/BIC, mentions, **logo** et **facture type** de référence → utilisés dans les PDF.
- **Clients** (`/clients`) : base alimentée **automatiquement** à la création d'un dossier + **ajout manuel**, avec recherche.

### À venir
- Envoi de mails depuis la plateforme (Resend) + journal des mails (table `emails` déjà prête).

## Installation locale

```bash
npm install
cp .env.local.example .env.local   # puis renseigne les clés
npm run dev
```

→ http://localhost:3000

### Variables d'environnement (`.env.local`)

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
ANTHROPIC_API_KEY=sk-ant-...        # pour l'extraction du rapport
ANTHROPIC_MODEL=claude-sonnet-4-6   # optionnel
```

## Configuration Supabase

Dans **SQL Editor**, exécute (Run) :

1. [`supabase/schema.sql`](supabase/schema.sql) — tout le schéma (dossiers, evenements, documents, entreprise, clients, emails) + buckets.
2. Si ta base existait déjà, exécute en plus les migrations manquantes :
   - [`supabase/migration_documents.sql`](supabase/migration_documents.sql) (devis/factures),
   - [`supabase/migration_profil_clients.sql`](supabase/migration_profil_clients.sql) (profil garage, clients, emails + bucket `entreprise`).

Récupère URL + clé `anon` dans **Project Settings > API**.

> ⚠️ MVP : accès données public (anon). L'authentification viendra plus tard.

## Déploiement Vercel

1. Push sur GitHub.
2. Import du repo sur Vercel.
3. Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **`ANTHROPIC_API_KEY`** (et éventuellement `ANTHROPIC_MODEL`).
4. Deploy.

## À venir

Coordonnées de l'entreprise configurables (en-tête PDF), authentification, planning atelier, paiements/relances.
