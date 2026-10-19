# Google Search Console — connexion et suivi de l'indexation

Site : https://myeasyauto.fr (adresse canonique déclarée par le site ; www.myeasyauto.fr sert la même chose).
Objectif : mesurer le trafic organique et l'indexation de la vitrine, base du suivi mensuel SEO.

## État au 19/10/2026 (constaté)

- robots.txt : OK — https://myeasyauto.fr/robots.txt (vitrine autorisée, appli connectée interdite, pointe vers le sitemap).
- sitemap.xml : OK — https://myeasyauto.fr/sitemap.xml, 12 URL :
  /, /fonctionnalites, /formules/essentiel, /formules/plus, /formules/premium, /formules/ultimate,
  /inscription, /contact, /facturation-electronique, /mentions-legales, /cgu, /confidentialite.
- Balise canonical : https://myeasyauto.fr (sans www) sur toutes les pages publiques.
- Aucune balise google-site-verification : la propriété Search Console n'existe pas encore.
- Point d'attention : https://www.myeasyauto.fr et https://myeasyauto.fr répondent TOUS LES DEUX en 200
  (pas de redirection de l'un vers l'autre). Google s'y retrouve grâce au canonical, mais une
  redirection 308 www → sans www est plus propre (voir étape 4).

## Étape 1 — Créer la propriété (méthode recommandée : propriété « Domaine »)

Elle couvre www, sans www, http et https d'un coup.

1. Ouvrir https://search.google.com/search-console/welcome avec le compte Google
   contact.ideaforma@gmail.com (ou le compte Google qui gérera le SEO).
2. Bloc de gauche « Domaine » → saisir : `myeasyauto.fr` → Continuer.
3. Google affiche un enregistrement TXT à copier, de la forme
   `google-site-verification=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`.
4. Aller chez le gestionnaire DNS du domaine myeasyauto.fr (là où les enregistrements A/CNAME
   vers Vercel ont été créés : registrar du nom de domaine, ou Vercel si les DNS y sont délégués) :
   - Si DNS chez Vercel : https://vercel.com → équipe « idea-s-projects » → Domains → myeasyauto.fr
     → Add record : Type `TXT`, Name `@` (ou vide), Value = la chaîne copiée, TTL par défaut.
   - Si DNS chez le registrar (OVH, Gandi, IONOS…) : zone DNS → ajouter un enregistrement TXT,
     sous-domaine vide / `@`, valeur = la chaîne copiée.
5. Attendre 5 à 30 min, revenir dans Search Console → « Valider ».
   Garder l'enregistrement TXT pour toujours (sa suppression fait perdre la propriété).

### Variante si le DNS n'est pas accessible : propriété « Préfixe d'URL » + balise HTML

1. Bloc de droite « Préfixe d'URL » → `https://myeasyauto.fr/` → Continuer.
2. Méthode « Balise HTML » → copier UNIQUEMENT la valeur de `content="..."`.
3. Vercel → projet garage-mymy → Settings → Environment Variables → ajouter
   `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` = la valeur copiée (Production).
4. Redéployer (Deployments → ⋯ → Redeploy). Le code (src/app/layout.tsx) émet alors
   la balise `<meta name="google-site-verification">` automatiquement.
5. Search Console → « Valider ». Créer ensuite aussi la propriété `https://www.myeasyauto.fr/`
   (même balise, déjà en place) pour voir ce qui est attribué au www.

## Étape 2 — Soumettre le sitemap

1. https://search.google.com/search-console/sitemaps (propriété myeasyauto.fr sélectionnée).
2. Champ « Ajouter un sitemap » → saisir : `https://myeasyauto.fr/sitemap.xml` → Envoyer.
3. Statut attendu sous 24–48 h : « Opération réussie », 12 URL découvertes.

## Étape 3 — Demander l'indexation des pages clés (une fois)

Dans la barre « Inspecter n'importe quelle URL » en haut de Search Console, coller une par une
puis « Demander une indexation » :
- https://myeasyauto.fr/
- https://myeasyauto.fr/fonctionnalites
- https://myeasyauto.fr/formules/essentiel
- https://myeasyauto.fr/inscription
- https://myeasyauto.fr/contact
(Quota ≈ 10 demandes/jour ; les autres pages suivront par le sitemap.)

## Étape 4 — Redirection www → sans www (recommandé)

Vercel → projet garage-mymy → Settings → Domains → ligne `www.myeasyauto.fr` → Edit →
« Redirect to » : `myeasyauto.fr`, code 308 → Save.
Vérifier ensuite que `NEXT_PUBLIC_SITE_URL` (Vercel, Production) vaut bien `https://myeasyauto.fr`
— c'est elle qui alimente canonical, sitemap et robots.

## Étape 5 — Relevé mensuel (à faire le 1er de chaque mois)

Pages à ouvrir :
- Indexation des pages : https://search.google.com/search-console/index
- Sitemaps : https://search.google.com/search-console/sitemaps
- Performances : https://search.google.com/search-console/performance/search-analytics (filtre 28 jours)
- Expérience / Signaux Web : https://search.google.com/search-console/core-web-vitals

| Mois | Pages indexées | Pages non indexées (motif principal) | Erreurs d'exploration | Clics 28 j | Impressions 28 j | Position moy. | Démos demandées | Commentaire |
|---|---|---|---|---|---|---|---|---|
| 10/2026 | — (propriété à créer) | — | — | — | — | — | — | Sitemap : 12 URL en ligne |
| 11/2026 |  |  |  |  |  |  |  |  |
| 12/2026 |  |  |  |  |  |  |  |  |
| 01/2027 |  |  |  |  |  |  |  |  |
| 02/2027 |  |  |  |  |  |  |  |  |
| 03/2027 |  |  |  |  |  |  |  |  |
| 04/2027 |  |  |  |  |  |  |  |  |

Cible : 12/12 pages du sitemap indexées, 0 erreur serveur (5xx) ; les pages de l'appli connectée
(/sinistres, /devis, /admin…) doivent apparaître comme « Bloquée par robots.txt » — c'est normal.
Motifs à surveiller : « Détectée, actuellement non indexée » (contenu jugé faible → enrichir la page),
« Page en double sans URL canonique sélectionnée par l'utilisateur » (problème www / sans www).
