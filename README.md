# GarageMYMY — Plateforme de gestion carrosserie

Suivi des dossiers de sinistres pour une carrosserie.
Stack : **Next.js 14** (App Router) + **Tailwind CSS** + **Supabase** (base de données + stockage des rapports), déploiement sur **Vercel**.

## Fonctionnalités (v0.1)

- **Tableau de bord** : dossiers en cours, agenda (événements à venir / passés), total € des dossiers du mois en cours.
- **Barre latérale** avec onglets : Tableau de bord, Sinistres, Agenda.
- **Onglet Sinistres** : liste des dossiers + bouton **+** pour ajouter un dossier avec :
  1. Informations du véhicule (immatriculation, marque/modèle, n° de série, 1ère mise en circulation)
  2. Informations du sinistre (date, n° sinistre, cabinet d'expert, date d'expertise, n° police, assureur)
  3. Informations du client (nom/prénom, adresse, code postal, ville)
- **Rapport d'expertise** : upload du PDF, stocké dans Supabase Storage et lié au dossier.
  _(L'extraction automatique des champs depuis le rapport viendra dans une étape suivante.)_

## Installation locale

```bash
npm install
```

Crée le fichier `.env.local` à partir de l'exemple, puis renseigne tes clés Supabase :

```bash
cp .env.local.example .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

(Clés disponibles dans Supabase > Project Settings > API)

Lance le serveur de dev :

```bash
npm run dev
```

→ http://localhost:3000

## Configuration Supabase

1. Crée un projet sur https://supabase.com
2. Ouvre **SQL Editor**, colle le contenu de [`supabase/schema.sql`](supabase/schema.sql) et clique **Run**.
   Cela crée les tables `dossiers` et `evenements`, le bucket `rapports`, et les règles d'accès.
3. Récupère l'URL et la clé `anon` dans **Project Settings > API** et mets-les dans `.env.local`.

> ⚠️ Pour le MVP, l'accès aux données est public (anon). L'authentification sera ajoutée plus tard.

## Déploiement Vercel

1. Pousse le repo sur GitHub (voir ci-dessous).
2. Sur https://vercel.com, **Import** le repo GitHub.
3. Ajoute les variables d'environnement `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Deploy.
