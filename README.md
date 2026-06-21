# GarageMYMY — Plateforme de gestion carrosserie

Suivi des dossiers de sinistres pour une carrosserie.
Stack : **Next.js 14** (App Router) + **Tailwind CSS** + **Supabase** (base + stockage) + **API Claude** (extraction des rapports) + déploiement **Vercel**.

## Fonctionnalités

- **Thème aurora** translucide (glassmorphism) animé.
- **Tableau de bord** : dossiers en cours, agenda, total € du mois.
- **Sinistres** : liste recherchable, fiche dossier complète, **pipeline de statut** (Nouveau → Expertise → Devis → Réparation → Facturé → Payé → Clôturé), édition/suppression, événements liés.
- **Importer un rapport (IA)** : on dépose le PDF d'expertise → l'API Claude en extrait véhicule, sinistre, client, expert, assurance → un dossier pré-rempli est créé (modifiable manuellement). Le PDF est stocké dans Supabase.
- **Devis & Factures** : création depuis un dossier (lignes, TVA, totaux, statut) et **export PDF**.

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

1. [`supabase/schema.sql`](supabase/schema.sql) — tables `dossiers`, `evenements`, `documents`, `document_lignes`, bucket `rapports`, règles d'accès.
2. Si ta base existait déjà avant les devis/factures, exécute en plus [`supabase/migration_documents.sql`](supabase/migration_documents.sql).

Récupère URL + clé `anon` dans **Project Settings > API**.

> ⚠️ MVP : accès données public (anon). L'authentification viendra plus tard.

## Déploiement Vercel

1. Push sur GitHub.
2. Import du repo sur Vercel.
3. Variables d'environnement : `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, **`ANTHROPIC_API_KEY`** (et éventuellement `ANTHROPIC_MODEL`).
4. Deploy.

## À venir

Coordonnées de l'entreprise configurables (en-tête PDF), authentification, planning atelier, paiements/relances.
