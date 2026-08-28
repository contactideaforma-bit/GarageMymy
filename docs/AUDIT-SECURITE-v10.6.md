# Audit de sécurité — v10.6 (28/08/2026)

Périmètre : toute la surface ajoutée depuis l'audit v6.x — vitrine et
formulaire de contact (v9.4), page publique /vente et espace commercial
(v10.0→v10.5), espace éditeur /admin (v53+), Factur-X (v52), assistant MY-MY
(v9.5), état des comptes et purge (v10.1), contrats collaborateurs (v10.6) —
plus revérification des risques documentés dans AUDIT-SECURITE.md.

## Méthode
Revue de code des 25 routes `src/app/api/**` (gardes d'authentification,
validation des entrées, usage du service role), des migrations SQL v34→v58
(RLS et policies), des policies Storage (v44), des variables `NEXT_PUBLIC_*`
et des chemins d'envoi d'email.

## Failles corrigées dans cette version

### 1. `/api/vente` — jokers SQL dans le code apporteur (MOYENNE, corrigée)
`commercialParCode` passait le code saisi tel quel à `ilike()`. `%` et `_`
sont des jokers : `?code=%` correspondait au premier commercial actif.
Un inconnu pouvait donc s'identifier comme un commercial (énumération de son
identité) et déclarer des ventes sans connaître aucun code réel.
**Correctif :** le code est réduit à `[A-Z0-9-]` (≥ 3 caractères) avant la
requête — plus aucun joker ne peut l'atteindre.

### 2. `/api/vente` — fiche de besoins non bornée (FAIBLE→MOYENNE, corrigée)
Le champ `besoins` (jsonb) d'une route publique acceptait un objet de taille
arbitraire (jusqu'à la limite plateforme ~4,5 Mo), stocké tel quel : un robot
pouvait gonfler la base. **Correctif :** refus au-delà de 100 Ko (413).

### 3. Migrations héritées v2/v4/v5/v6 — policies ouvertes réactivables (MOYENNE, corrigée)
Le correctif v6.3 avait neutralisé `schema.sql` et deux fichiers hérités,
mais `migration_v2/v4/v5.sql` contenaient encore des
`create policy … for all using (true)` (rôle anon sur experts, assureurs,
vehicules, paiements, relances) et `migration_v6.sql` recréait des policies
`authenticated using (true)` sur les 12 tables de base. Le workflow étant de
COLLER les fichiers à la main dans Supabase, un mauvais collage aurait rouvert
ces tables (anon) ou donné à chaque compte l'accès aux données de tous les
garages jusqu'au re-passage de la v8. **Correctif :** ces `create policy` sont
supprimés des fichiers (le DDL des tables reste, les `drop policy` restent) —
la v8 demeure la seule source des policies owner.

### 4. Durcissement anti header-injection (FAIBLE, corrigée)
Les champs publics repris dans des SUJETS d'email (`garage_nom` sur /vente ;
nom, garage, email, téléphone sur /contact) acceptaient des caractères de
contrôle (`\r`, `\n`). Les transports actuels (nodemailer, Resend) les
neutralisent déjà ; défense en profondeur : ils sont désormais remplacés par
des espaces à l'entrée.

## Vérifié sain (échantillon des points de contrôle)
- **Gardes d'auth** : toutes les routes non publiques exigent le Bearer
  Supabase (`lib/apiAuth.ts`, validation par `admin.auth.getUser`).
  `/api/admin/*`, `/api/etat` POST, `/api/support/admin` exigent en plus
  `estAdminServeur` (liste serveur `ADMIN_EMAILS`).
- **Routes publiques assumées** : /contact et /vente (piège à robots +
  limite horaire par IP + tailles bornées + prix RECALCULÉS serveur),
  /signature et /suivi (jeton UUID, réponse minimale, garde atomique
  `.is("signe_le", null)`), /etat GET (lecture seule d'incidents).
- **Crons** (`relances-auto`, `cron-comptes`, `notifications-push`) :
  FAIL-CLOSED — sans `CRON_SECRET` la route refuse ; Bearer exigé.
- **Espace commercial** (`/api/commercial`) : chaque action filtre par
  `owner_id = user.id` (sauf éditeur) — pas d'accès croisé prospects/ventes.
- **Espace éditeur** (`/api/admin/donnees`) : liste blanche de tables,
  purge protégée par le mot PURGER, mot de passe provisoire renvoyé
  UNIQUEMENT si l'email de bienvenue n'est pas parti.
- **Documents du pack** (`/api/admin/pack-doc`, `/api/commercial/pack`) :
  liste blanche de clés (`packDocs.ts`) — aucun chemin utilisateur ne touche
  le système de fichiers ; le commercial n'accède qu'aux documents
  commerciaux.
- **RLS v34→v58** : toutes les nouvelles tables ont la RLS ; tables admin
  (v53/v55/v56/v57/v58) SANS policy (invisibles du navigateur) sauf les
  lectures voulues (`ventes_select_own`, `prospects_own`,
  `comptes_etat_select_own`, `collaborateur_documents_select_own`,
  incidents publics v45 — assumé).
- **Storage** : cloisonné par préfixe `owner_id/` (v44) sur rapports /
  pieces / prive — le risque « storage non cloisonné » de l'ancien audit est
  LEVÉ. `entreprise` reste public en lecture (logos), écriture chez soi.
- **Secrets** : seuls `SITE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
  `VAPID_PUBLIC_KEY`, `ADMIN_EMAILS` sont NEXT_PUBLIC (tous assumés) ;
  service role / Anthropic / CRON_SECRET côté serveur uniquement.
- **SMTP** : mot de passe chiffré AES-256-GCM au repos, jamais renvoyé au
  client (`hasPassword` seulement) ; expéditeur toujours résolu serveur.
- **IA** : quota mensuel FAIL-CLOSED + plafond 15 Mo sur /extract-rapport,
  /extract-carte-grise ; quota aussi sur /api/mymy ; Factur-X borné à 12 Mo.

## Risques résiduels acceptés (inchangés, à garder en tête)
1. **Limite de débit en mémoire** (/contact, /vente) : par instance
   serverless — un attaquant distribué la contourne. Suffisant au volume
   actuel ; passer par le WAF/rate-limit Vercel si abus constaté.
2. **`ADMIN_EMAILS` visible dans le bundle** (affichage des onglets admin) :
   assumé depuis la v9.4 — le contrôle réel est serveur.
3. **Jeton de signature sans expiration** : réponse minimale une fois signé
   (v6.3) ; ajouter `sign_token_expire_le` si le besoin apparaît.
4. **IBAN de l'éditeur affiché sur /vente** : choix produit (paiement par
   virement sur place).
5. **Comparaison du CRON_SECRET non constant-time** : théorique, négligeable
   derrière Vercel.

Prochain audit : à refaire après l'étape 2 Factur-X ou toute nouvelle route
publique.
