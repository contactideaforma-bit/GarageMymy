# Note de repositionnement — « Adhésion Service » (septembre 2026)

## Pourquoi on change

Le mot « secrétaire » fait peur : la plupart des carrosseries ont déjà quelqu'un qui gère le secrétariat et les factures (le patron, la conjointe, une salariée). Proposer « une secrétaire à distance » sonne comme « on va remplacer votre personne ». Résultat : la personne en place devient un frein à la vente, et le patron se sent obligé de choisir.

Ce qu'on vend en réalité n'est pas du secrétariat : c'est le **déblocage des dossiers compliqués** — litiges, impayés, dossiers qui traînent depuis des mois, ceux qui demandent des dizaines d'appels aux assurances, aux experts et aux clients. Personne au garage n'a le temps ni la spécialité pour ça. On ne prend le travail de personne : on apporte un renfort spécialisé.

## Les nouveaux noms

| Ancien nom | Nouveau nom | Contenu |
|---|---|---|
| ESSENTIEL | ESSENTIEL (inchangé) | l'application seule |
| STARTER | **Adhésion Service Plus** | appli + 10 h / mois de déblocage de dossiers |
| CONFORT | **Adhésion Service Premium** | appli + 20 h / mois de déblocage de dossiers |
| SÉRÉNITÉ | **Adhésion Service Ultimate** | appli + 40 h / mois de déblocage de dossiers |

Prix, remises, primes et commissions : inchangés. Seuls le nom et le discours changent. En interne (base de données, contrats existants, simulateur), les codes `starter / confort / serenite` restent les mêmes ; seul le libellé affiché change.

Les personnes qui assurent le service s'appellent désormais des **chargés de mission spécialisés dans la gestion des litiges** (plus « secrétaires » ni « collaboratrices » dans les documents destinés aux garages).

## Le discours en une phrase

> « L'Adhésion Service, c'est un chargé de mission spécialisé dans les litiges qui reprend vos dossiers bloqués — impayés, litiges, dossiers qui traînent depuis des mois — et qui appelle l'assurance, l'expert, le client, autant de fois qu'il faut, jusqu'à ce que l'argent rentre. »

Règle d'écriture : on ne dit jamais dans un document « on ne remplace pas votre secrétaire ». On décrit ce que le service fait ; le garage en tire lui-même la conclusion.

## Réponses aux objections

**« J'ai déjà quelqu'un qui s'occupe des papiers. »**
Tant mieux : l'application lui fait gagner du temps sur les devis et les factures. Le chargé de mission, lui, ne s'occupe que des dossiers qui bloquent : ceux où il faut rappeler l'assurance quatre fois, contester un chiffrage, récupérer une franchise impayée.

**« Je peux relancer moi-même. »**
Combien de dossiers de plus de 90 jours avez-vous en ce moment ? Combien d'argent ça représente ? Chaque heure passée au téléphone avec une assurance est une heure de moins à l'atelier. Le chargé de mission fait ça toute la journée, il connaît les interlocuteurs et les procédures.

**« C'est cher. »**
Un seul dossier de 2 000 € débloqué paie plusieurs mois d'Adhésion. Et le temps est enregistré dans l'application : le garage voit exactement à quoi partent ses heures.

**« Qu'est-ce qu'il ne fait pas ? »**
Pas de comptabilité, pas de paie, pas de signature au nom du garage, pas de maniement de fonds. Il ne prend aucune décision à la place du patron : il fait avancer, il rend compte.

## Ce qui a été mis à jour

Le mot « secrétaire / secrétariat » a disparu de toute la documentation et de l'application : fiches et plaquettes (sources HTML + PDF), flyer carrossiers, l'ensemble des documents Word du pack commercial et leurs PDF régénérés (argumentaire, guide et kit du commercial, formations, grille de commissions, fiche rentabilité, devis type, avenant, formulaires, procédures internes, contrats et CGV, charte de périmètre, guide collaborateur), et tous les textes visibles de l'application (libellés des formules, e-mails, contrats générés, conversation, compteur d'heures, espace éditeur). Les personnes sont désormais des « chargés de mission », le service est « l'Adhésion Service ».

## Points de vigilance

Les contrats et CGV générés par l'application (contrat garage, contrat collaborateur, DPA) et les documents Word contractuels ont été modifiés par remplacement de termes : à faire relire avant la prochaine signature. Les noms de fichiers (`DEVIS-TYPE_appli-et-secretariat`, `FORMATION_secretaire`, dossier `secretaires/`…) et les identifiants techniques (`secretaire_id`, codes `starter / confort / serenite`) n'ont pas été renommés : ils sont référencés par l'application et n'apparaissent pas aux garages. Les documents destinés aux collaborateurs décrivent encore un périmètre de missions « saisie / devis / factures » : à faire évoluer vers le déblocage des dossiers et la gestion des litiges lorsque le recrutement s'alignera.
