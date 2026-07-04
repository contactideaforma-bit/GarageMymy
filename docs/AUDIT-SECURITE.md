# Audit sécurité — My Easy Auto (v3.2)

Audit réalisé avant commercialisation. État : **corrigé sauf mention contraire**.

## Corrigé dans cette version

### CRITIQUE — Routes API ouvertes à internet
Les routes `/api/send-email`, `/api/mail-config` (lecture ET écriture),
`/api/extract-rapport` et `/api/extract-carte-grise` ne vérifiaient pas
l'identité de l'appelant :

- `/api/send-email` était un **relais de spam ouvert** (n'importe qui pouvait
  envoyer des emails depuis la boîte du garage) ;
- `/api/mail-config` permettait de **lire et modifier la config SMTP** ;
- les routes d'extraction permettaient de **consommer les crédits IA**.

Correctif : toutes ces routes exigent désormais un jeton Supabase valide
(`Authorization: Bearer`, vérifié côté serveur — `lib/apiAuth.ts`), envoyé
automatiquement par le client via `lib/apiClient.ts` (`fetchAuth`).
`/api/relances-auto` reste protégée par `CRON_SECRET`.

### CRITIQUE — Config SMTP globale (fuite entre garages)
`mail_config` était une table à ligne unique : dans un déploiement
multi-garages, tous auraient envoyé depuis la même boîte. Correctif :
colonne `owner_id` (migration v17), chaque garage a SA config ; l'envoi
(manuel et relances automatiques) utilise la config du garage concerné.

### ÉLEVÉ — Documents personnels accessibles par URL publique
Les buckets `rapports` (rapports d'expertise : noms, adresses, immatriculations)
et `pieces` (cartes grises, constats) étaient **publics** : quiconque disposant
d'une URL pouvait lire les fichiers. Correctif : buckets passés en **privé**
(migration v17), l'appli génère des **liens signés valables 1 h**, réservés
aux utilisateurs connectés. Le bucket `entreprise` (logo) reste public.

### MOYEN — En-têtes de sécurité HTTP absents
Ajoutés dans `next.config.mjs` : HSTS, X-Frame-Options (anti-clickjacking),
X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

## Déjà en place (vérifié)

- **RLS par garage** sur toutes les tables métier (17 tables, policies
  `owner_id = auth.uid()`, défaut `auth.uid()` à l'insertion).
- `mail_config` : RLS activée SANS policy → inaccessible depuis le client,
  accès uniquement serveur (service role).
- Pas d'inscription ouverte (comptes créés manuellement — abonnements gérés
  à la main, décision assumée).
- Corps des emails échappé (HTML) avant envoi.
- Clés sensibles (`SUPABASE_SERVICE_ROLE_KEY`, `ANTHROPIC_API_KEY`,
  `CRON_SECRET`) côté serveur uniquement, jamais préfixées `NEXT_PUBLIC`.

## Reste à faire (accepté pour l'instant)

1. **Cloisonnement du Storage PAR garage** : les buckets sont privés, mais un
   utilisateur CONNECTÉ d'un autre garage pourrait techniquement lire les
   objets via l'API (les chemins ne sont pas préfixés par `owner_id`).
   Risque faible tant que les comptes sont créés à la main pour des clients
   connus. À faire avant d'ouvrir l'inscription : préfixer les chemins par
   `owner_id` + policies storage sur ce préfixe (+ migration des fichiers).
2. **Limitation de débit (rate limiting)** sur les routes IA et email
   (un utilisateur légitime mais compromis pourrait épuiser les crédits).
3. **Mot de passe SMTP stocké en clair** dans `mail_config` (protégé par
   service role). Chiffrement applicatif possible plus tard.
4. `/api/bank-sync` GET renvoie un booléen `configured` sans auth (sans
   gravité) ; le POST est un stub 501.

## Rappels d'exploitation

- Exécuter `supabase/migration_v17.sql` (config SMTP par garage + buckets privés).
- Vérifier que `CRON_SECRET` est bien défini sur Vercel.
- Ne jamais committer `.env.local` (déjà dans `.gitignore`).
