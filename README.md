# Rétention Wikimédia

**[Tester l’application en ligne](https://retention-wikimedia.vercel.app/)**, sans installation ni compte.

Application indépendante en français et en anglais pour analyser les parcours de contribution après une formation, un atelier, un cours ou une campagne. React, TypeScript strict et Vite côté navigateur ; Python, FastAPI, httpx async et Pydantic côté API. Licence **GPL-3.0-or-later**, texte dans `LICENSE`.

## Fonctionnement

Le sélecteur de langue en haut à droite passe du français à l’anglais sans changer les données, les calculs ou le périmètre de collecte. Le style Observatoire est utilisé sur toute l’application. Un lien direct est disponible : [Open in English](https://retention-wikimedia.vercel.app/?lang=en).

1. **Importer** les noms par collage, TXT, CSV UTF-8 (virgule, point-virgule ou tabulation), ou URL HTTPS d’un programme Programs & Events Dashboard. Le CSV propose un aperçu, la colonne et la présence d’un en-tête. Relire la liste et cocher les comptes à exclure. « Vérifier les comptes et continuer » confirme leur existence, récupère leur date de création et détecte les bots, par lots de 50. Aucune contribution n’est collectée à ce stade. Un bilan indique les comptes vérifiés et exclus ; la liste mise à jour reste accessible dans Importer. Une vérification incomplète reste sur cette liste pour permettre une nouvelle tentative.
2. **Paramétrer** les dates réelles de l’événement dans l’onglet Paramétrer. Les dates du Dashboard doivent être confirmées ou remplacées ; une fin future oblige à saisir les dates réelles. Ces modifications concernent uniquement l’analyse et ne nécessitent aucun droit d’administration sur le Dashboard. Pour un événement d’une journée, saisir la même date de début et de fin. La date de fin ne limite pas le suivi ultérieur des contributions, qui continue jusqu’à la date d’analyse. Choisir les participants (« Tout le monde » ou « Uniquement les nouveaux comptes »), les projets d’origine, le périmètre et la règle sur les éditions automatisées. La fenêtre de création apparaît uniquement pour les nouveaux comptes. J-14 à J retient les créations entre 14 jours avant le début et le jour du début inclus. La période personnalisée propose deux dates de création. Un tableau explique, pour chaque compte, sa sélection ou son motif de non-sélection. Un seul périmètre est affiché à la fois : les projets fournis par le Dashboard, tous les projets cochés automatiquement dans toutes leurs langues, ou une sélection personnalisée vide au départ. Les choix personnalisés sont conservés lors des changements de mode. Les projets sont regroupés par famille ; les éditions linguistiques peuvent être recherchées et sélectionnées individuellement ou toutes ensemble.
3. **Collecter** les contributions par pages courtes, avec progression, pause, reprise et annulation. Une annulation conserve les données déjà obtenues et la file de travail en mémoire.
4. **Résultats** : poser la question « combien de personnes ont fait au moins une modification après l’événement ? ». Choisir J+30, J+60, J+90, J+120, J+365, un nombre personnalisé ou Aujourd’hui. La période va du lendemain de la fin jusqu’à l’échéance incluse. Sélectionner les familles de projets, les langues de Wikipédia (français et anglais par défaut, autres langues disponibles) et les types de modifications sur Wikipédia (articles par défaut). Les autres projets comptent toutes les catégories. Deux graphiques montrent les personnes ayant contribué et les projets fréquentés, en nombres ou en pourcentages. La « Liste des contributeurs » affiche les personnes ayant contribué dans la période et sur les projets choisis. Un sélecteur permet aussi de consulter tous les comptes importés et de revenir sur les exclusions. Les fiches se déplient sous chaque nom, avec les contributions de la période et des liens vers l’historique public complet sur les projets concernés. Exporter CSV, JSON réimportable, PDF et graphiques PNG/SVG. Le PDF reprend la question et les filtres affichés, sans noms par défaut.

Les définitions, les sources, les limites et les règles de confidentialité sont décrites dans [Sources et méthode](#sources-et-méthode) et dans le rapport PDF. Le menu de l’application comporte uniquement les quatre étapes de l’analyse.

Le bilan est cumulé depuis la fin de l’événement : une modification faite à J+2 est comptée à J+30 et à J+90. Il ne mesure pas l’activité du seul jour de l’échéance et ne prouve pas qu’un compte continue à contribuer ce jour-là. Les dates exactes sont affichées. Une échéance future ou une collecte incomplète conserve les observations, sans taux définitif. Les comptes sans contribution observée restent « Données insuffisantes » tant que leur collecte n’est pas complète.

Les catégories, exclusions, fenêtres de création et filtres d’affichage se recalculent localement. La collecte interroge uniquement les comptes retenus : les comptes exclus et, en mode « Uniquement les nouveaux comptes », les comptes hors de la fenêtre de création ne sont pas interrogés pour leurs contributions. Le compteur et les états techniques portent sur cette même sélection. Réintégrer un compte ou élargir la fenêtre peut nécessiter de relancer la collecte pour compléter les comptes nouvellement retenus ; les comptes déjà complets ne sont pas réinterrogés dans le même périmètre. Changer les dates ou les projets à collecter exige une nouvelle collecte.

La liste des participants est paginée (25 comptes par défaut), avec recherche, case « À exclure ? » et détails dépliables. Les comptes d’organisation et d’accompagnement sont exclus par défaut ; les choix manuels sont conservés à la vérification. À droite du menu, « Retour » revient à l’étape précédente sans effacer les données. « Nouvelle analyse » demande confirmation, propose une sauvegarde JSON et arrête les requêtes en cours avant la remise à zéro. Les résultats distinguent les participants retenus et les collectes complètes ; une annulation ne transforme pas un compte incomplet en compte inactif.

## Sources et méthode

Version méthodologique : **1.0**. Les dates et mois sont UTC. La date de référence est figée à la collecte. Les contributions sont des révisions publiques, pas une mesure du volume de texte ajouté ni un inventaire complet des téléversements ou journaux.

- [CentralAuth](https://www.mediawiki.org/wiki/Extension:CentralAuth/API) : `list=globalusers`, `gususers`, `gusprop`, puis `meta=globaluserinfo` pour les comptes locaux. `globalusers` permet 50 noms par demande. `globaluserinfo` reste individuel parce que l’inventaire des comptes locaux n’est pas proposé par lots dans ce module.
- [MediaWiki Usercontribs](https://www.mediawiki.org/wiki/API:Usercontribs) : lots de noms, bornes UTC, pages de 500 révisions et `uccontinue` ; `siteinfo` fournit les espaces de noms canoniques. `sitematrix` fournit le catalogue officiel.
- [XTools](https://xtools.wmcloud.org/api) : `/api/user/globalcontribs/{username}/all/{start}/{end}/{offset}`, continuation par timestamp, appels séquentiels. En cas d’échec, CentralAuth fournit les wikis pertinents, interrogés par MediaWiki.
- [Programs & Events Dashboard](https://outreachdashboard.wmflabs.org) : `/courses/Organisation/Programme/course.json` et `/courses/Organisation/Programme/users.json`, sans authentification. Seules les informations publiques nécessaires sont conservées ; noms civils, courriels et passcodes ne sont pas repris.

Un nouveau compte est créé dans la fenêtre déclarée. Les préréglages J-7, J-14 et J-30 se terminent le jour du début de l’action inclus. Une plage personnalisée possède ses propres dates de création, distinctes des dates de l’événement. Le paramétrage montre les dates exactes de cette fenêtre et le nombre de comptes retenus avant collecte. « Tout le monde » inclut tous les comptes non exclus. Les dates inconnues ne permettent pas de sélectionner un nouveau compte. Les noms contenant « bot » ne suffisent jamais à classifier un bot. Les espaces de noms sont classifiés par nom canonique, famille et projet suivant `config/contribution_taxonomy.yaml`. Les révisions annulées restent des révisions observées. Les résultats ne prouvent pas un effet causal de l’action.

## Confidentialité et sécurité

Pas de compte, de base distante, d’analytics, de cookie applicatif ni de stockage nominatif persistant dans le navigateur. Seul le choix de langue est conservé localement. Les données nominatives restent en mémoire de session, avec export JSON volontaire. Le bouton d’effacement supprime l’état de l’analyse. Une fermeture ou un rechargement sans export perd les données.

Le backend ne conserve aucune cohorte entre requêtes. Son cache partagé contient uniquement le catalogue et les espaces de noms publics. Les noms et les cohortes passent dans des corps POST, sans journal d’accès Uvicorn. Ne pas activer de journal de corps de requête ou de trace httpx en production. Les fournisseurs peuvent naturellement recevoir les noms nécessaires aux recherches publiques. Les plateformes d’hébergement appliquent leurs propres règles de journalisation et de conservation.

Le serveur construit toutes les URL. Le Dashboard est limité à deux hôtes HTTPS précis, sans identifiants, port alternatif ou traversée de chemin. Les wikis doivent appartenir au catalogue officiel et aux domaines contrôlés. Les fichiers sont vérifiés côté client : UTF-8 strict, 2 Mo pour TXT/CSV, 50 Mo pour JSON, 1 000 comptes au maximum. Les chaînes affichées sont échappées par React. Les CSV neutralisent les préfixes de formule. Les requêtes API sont limitées à 1 Mo et les noms à 255 caractères. Aucune requête serveur ne lance l’analyse d’une cohorte entière.

## Installation et lancement local, Windows

Python 3.11 ou plus et Node.js 22 ou 24 sont requis. La configuration de déploiement cible Python 3.13. Ouvrir PowerShell :

```powershell
cd 'C:\Codex\Projects\Wikimedia Enterprise\retention-wikimedia'
python -m venv .venv
.\.venv\Scripts\python -m pip install -r requirements-dev.txt
npm --prefix frontend ci
```

Premier terminal, backend :

```powershell
cd 'C:\Codex\Projects\Wikimedia Enterprise\retention-wikimedia'
$env:RETENTION_USER_AGENT = 'WikimediaRetention/1.0 (+URL_DU_DEPOT_PUBLIC; CONTACT_PUBLIC)'
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Second terminal, frontend :

```powershell
cd 'C:\Codex\Projects\Wikimedia Enterprise\retention-wikimedia'
npm --prefix frontend run dev
```

Ouvrir <http://127.0.0.1:5173>. Vite transmet `/api` au backend local. Pour tester le service portable qui sert aussi les fichiers statiques :

```powershell
npm --prefix frontend run build
.\.venv\Scripts\python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000 --no-access-log
```

Ouvrir alors <http://127.0.0.1:8000>. Redémarrer le backend après le premier build si le dossier `frontend/dist` n’existait pas au démarrage.

## Tests et contrôles

Les tests automatiques utilisent des comptes d’exemple comme Alice et Bob et des réponses API simulées pour vérifier les calculs et les erreurs de collecte. Ces données servent uniquement aux tests et ne sont pas utilisées par l’application publiée. Les analyses utilisent les comptes importés et les contributions publiques récupérées. `frwiki` est l’identifiant technique de Wikipédia en français.

```powershell
.\.venv\Scripts\python -m pytest -q
.\.venv\Scripts\python -m ruff check backend tests scripts
.\.venv\Scripts\python -m ruff format --check backend tests scripts
npm --prefix frontend test
npm --prefix frontend run lint
npm --prefix frontend run build
cd frontend
npx playwright install chromium
npm run test:browser
```

Les tests navigateur attendent les deux serveurs sur 8000 et 5173. Ils utilisent des réponses publiques simulées et téléchargent des fichiers vérifiables dans `output`. Les tests unitaires ne dépendent pas du réseau.

Contrôles publics facultatifs, depuis la racine :

```powershell
.\.venv\Scripts\python -m scripts.probe_apis
.\.venv\Scripts\python -m pytest -m integration -o addopts='' -q
```

Pour le programme Dashboard réel, définir `RETENTION_TEST_DASHBOARD_URL` sur l’URL d’un programme public avant le test. Les contrôles d’intégration restent désactivés dans les tests standard et la CI. Voir `docs/verification.md` pour les résultats réellement observés et les restrictions réseau de l’environnement de développement.

## Limites externes

Les API peuvent refuser une requête, ralentir, limiter les appels, changer leur schéma ou présenter un retard de réplication. `Retry-After` est respecté, sans contournement. Un compte supprimé, masqué ou renommé, une révision masquée ou un compte local non rattaché ne peut pas toujours être attribué correctement. XTools ne couvre pas nécessairement tous les projets publics récents ou non répliqués ; le secours MediaWiki réduit cette dépendance sans garantir l’accès à des données supprimées.

La détection de l’automatisation est partielle. Les projets fréquentés sont des observations, pas une preuve d’abandon d’un projet ni d’un lien causal avec la formation. Un renommage ne résout pas automatiquement la nouvelle identité du compte dans cet outil. Un nouveau compte distinct doit être ajouté manuellement ; aucun rapprochement de personnes n’est inféré. Les comptes extrêmement actifs exigent de nombreuses pages et de la mémoire navigateur. Le format JSON a une limite de 50 Mo à l’import, affichée explicitement. Aucune troncature silencieuse de la collecte n’est appliquée.
