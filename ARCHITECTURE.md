# Architecture

## Pipeline et responsabilités

Le navigateur possède la session, le catalogue consulté, les espaces de noms, la cohorte normalisée, les révisions et la file de pages. `Collector` qualifie les comptes par lots, prépare les tâches, effectue une page à la fois et publie un état après chaque réponse. Cette orchestration évite une longue fonction serverless et permet pause, reprise et conservation des résultats partiels.

Le backend valide des tâches bornées et adapte les API externes. `providers/centralauth.py`, `dashboard.py`, `mediawiki.py`, `xtools.py` et `catalog.py` isolent les formats. `models.py` porte les contraintes Pydantic. `analysis/taxonomy.py` lit les règles YAML, exposées au navigateur par `/api/taxonomy`.

Les calculs sont des fonctions TypeScript pures dans `frontend/src/analysis/{cohorts,followup,taxonomy,aggregation}.ts`. Leur exécution côté client est intentionnelle : changer les inclusions ou catégories ne transmet pas une nouvelle cohorte au serveur. Les providers Python n’implémentent pas une seconde version des mêmes calculs. Ces calculs ne dépendent pas de l’hébergeur.

## Couverture

Le mode global tente XTools, pour chaque compte, sur l’intervalle allant du début de l’observation antérieure jusqu’à la date de référence. En cas d’échec, `globaluserinfo` fournit les comptes locaux ayant des éditions. Chaque wiki connu est interrogé par MediaWiki, avec déduplication des révisions par couple projet et identifiant.

Dans un périmètre sélectionné, l’observation avant et pendant l’action couvre les comptes locaux CentralAuth ; les révisions après l’action sont collectées sur les projets choisis. Les tâches des mêmes projets et bornes sont regroupées par 50 noms. Les projets hors sélection sont bornés à la fin de l’action. La taxonomie est récupérée indépendamment des filtres, de sorte que décocher une catégorie ne supprime aucune donnée.

Chaque compte garde `pre_complete`, `post_complete`, un état technique, ses sources et avertissements. Un projet inconnu ou une page interrompue invalide la complétude du compte, tout en conservant les révisions acquises. Un échec sur un compte ne supprime pas les autres résultats. Les taux sont `null` si la période est future ou si un compte retenu est incomplet. Le numérateur observé et le dénominateur restent disponibles. La signature de collecte rend visible un changement de périmètre nécessitant une recollecte.

## Pagination, retries et cache

MediaWiki utilise `uccontinue`. XTools utilise son champ `continue`, un timestamp transmis comme offset. Un curseur identique au précédent interrompt la boucle et produit une collecte incomplète. Le backend réalise un appel externe par tâche, avec timeout de 18 secondes et maximum de trois requêtes MediaWiki concurrentes par instance. Une sémaphore séquentialise XTools dans cette instance. Le navigateur exécute aussi la collecte séquentiellement.

Le navigateur effectue au maximum trois nouvelles tentatives après la première demande. Il attend le maximum entre `Retry-After` et un backoff exponentiel avec jitter. Les formats numérique et HTTP-date de `Retry-After` sont pris en charge. La pause bloque la demande suivante, l’annulation utilise `AbortController`. Le backend ne dort pas pendant un cooldown long et ne garde aucune tâche nominative.

Le cache partagé Python a un TTL d’une heure et contient exclusivement `sitematrix` et `siteinfo/namespaces`. Les métadonnées de comptes et les contributions restent dans la session client. Le nombre total de visiteurs n’est pas coordonné par un verrou distribué : respecter les conditions des sources et dimensionner l’hébergement en conséquence.

## Modèles et archivage

`Session` est versionné avec `schema_version`, `methodology_version` et `application_version`. Le JSON contient les paramètres, la date de génération, la cohorte, les révisions, les métadonnées de projets, les espaces de noms, les règles, les diagnostics, la question de suivi, les résultats et la file interrompue. L’import Zod vérifie les versions, dates, nombres, catégories, comptes uniques et associations de révisions. Les résultats sont recalculés à l’import. Le champ optionnel `question` contient l’échéance (nombre de jours ou `today`), les familles de projets, les langues et catégories Wikipédia. Une archive antérieure sans ce champ utilise les choix par défaut. Les échéances sont cumulées de J+1 à J+X, bornes incluses ; `today` exige une collecte couvrant la date actuelle pour un taux définitif.

Un compte absent de CentralAuth est distingué d’une requête de qualification indisponible. `globalusers.centralid` est conservé, sans confondre avec l’ID local. Les groupes de bot explicites globaux et locaux sont utilisés ; aucun motif dans le nom n’est un détecteur. Les éditions MediaWiki utilisent flags et tags connus, XTools garde une automatisation inconnue en absence de marqueur.

## Taxonomie

`config/contribution_taxonomy.yaml` est la source des règles. Les espaces de noms canoniques sont consultés dynamiquement, puis les exceptions de projet précèdent les règles de famille. Les espaces de discussion sont communautaires. Template, Module et Category sont de la maintenance. Les fichiers Commons sont médias ; les entités Wikidata sont données structurées ; Page sur Wikisource est contenu, Index est maintenance. Une entrée absente est OTHER, jamais un namespace 0 supposé universel.

## Exports

PapaParse produit les CSV avec BOM, séparateur point-virgule, guillemets et protection contre les préfixes de formule. ECharts rend en SVG ; les PNG passent par un canvas local. jsPDF et AutoTable produisent des textes, tableaux et figures vectorielles, sans capture HTML. Le rapport est agrégé par défaut, avec détail nominatif facultatif. Aucun export n’est envoyé à un serveur.

## Portabilité

`api/index.py` expose l’app ASGI pour Vercel, qui distribue le build Vite et route `/api/*` vers Python. `Procfile` lance la même app avec Uvicorn sur Toolforge. Le Build Service trouve les runtimes Node/Python grâce aux fichiers racine et compile `frontend/dist` ; FastAPI distribue ces fichiers. Aucun disque applicatif persistant n’est utilisé. La seule variable métier de déploiement est `RETENTION_USER_AGENT`.
