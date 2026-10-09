# Rétention Wikimédia

**Français** | [English](README.md)

## Utiliser en ligne

**[Ouvrir Rétention Wikimédia sur Toolforge](https://wikimedia-retention.toolforge.org/?lang=fr)**. Aucune installation ni aucun compte ne sont nécessaires.

Un outil indépendant pour étudier les contributions publiques après une formation, un atelier, un cours ou une campagne. L’interface est disponible en français et en anglais.

## Fonctionnement

1. **Importer les participants** par collage de pseudos, fichier TXT ou CSV, ou URL publique d’un programme Programs & Events Dashboard. Une analyse sauvegardée en JSON peut aussi être réimportée.
2. **Relire les exclusions** dans le tableau des participants. Cocher une case prépare une modification. Cliquer sur **Appliquer les exclusions sélectionnées** pour la confirmer, puis vérifier les comptes et continuer. Cette vérification contrôle leur existence, leur date de création et leur statut de bot, sans collecter de contributions.
3. **Paramétrer le périmètre** : dates réelles de l’événement, participants, projets et traitement des éditions automatisées. Les dates du Dashboard doivent être confirmées ou corrigées. Les nouveaux comptes peuvent être sélectionnés selon une fenêtre explicite de dates de création.
4. **Collecter les contributions**, avec progression, pause, reprise et annulation. L’annulation conserve les données déjà recueillies dans la session.
5. **Explorer les résultats** par période de suivi, projet et type de contribution. Exporter en CSV, JSON réimportable, rapport PDF ou graphiques PNG/SVG.

Le changement de langue conserve l’analyse en cours. Réintégrer des comptes exclus ou élargir la sélection peut nécessiter une collecte complémentaire. Changer les dates ou les projets à collecter exige une nouvelle collecte.

## Nouveaux inscrits sur Wikipédia en français

La quatrième source d’import charge les comptes créés un jour précis ou entre deux dates incluses. Le module utilise les actions `create`, `create2` et `byemail` du journal public. Les IP, les comptes temporaires (actifs ou expirés) et les rattachements automatiques sont exclus. Le compte créé est identifié à partir de la cible du journal, pas du compte qui a effectué la création. Les identifiants locaux permettent de retrouver les comptes renommés lorsqu’ils sont disponibles.

Le format pris en charge commence le **18 avril 2006**, premier jour UTC complet après l’apparition de l’action `create` dans le journal de Wikipédia en français. Des entrées plus anciennes existent depuis septembre 2005, mais leur format n’est pas pris en charge. Les dates d’unification CentralAuth, parfois postérieures à l’inscription locale, ne remplacent pas la date du journal. Une date globale antérieure à l’inscription locale révèle un compte déjà existant. Les entrées masquées ou les comptes introuvables sont signalés et restent hors du groupe analysable.

Après import, choisissez l’observation depuis l’inscription propre à chaque compte jusqu’à une date, ou sur une plage de dates après son inscription. La sélection rapide propose Wikipédia francophone, anglophone et germanophone, Commons, Wikidata, Wiktionnaire francophone et Wikisource francophone. Chaque projet peut être décoché. Les autres modes couvrent tous les projets publics et toutes les langues, ou une sélection par famille et langue.

Les comptes identifiés comme bots sont exclus par défaut. La case d’exclusion des modifications marquées bot ou automatisées est visible et cochée par défaut dans ce parcours. Les compteurs de collecte sont actualisés toutes les deux secondes, sans requête supplémentaire. La recherche des projets où les comptes contribuent est affichée séparément du nombre de comptes entièrement traités.

L’interface donne une estimation fixe d’environ 17 minutes pour examiner les projets de contribution de 1 000 comptes. Elle correspond à l’hypothèse d’un appel d’une seconde par compte, soit 16 min 40, et ne constitue pas une durée mesurée. La récupération des modifications ajoute un temps variable.

Les types de pages choisis filtrent uniquement Wikipédia. Tous les types de révisions publiques des autres projets sont pris en compte. Une contribution est une révision publique, y compris sur Commons, et non chaque opération de téléversement ou chaque entrée de journal.

Le bilan textuel, les graphiques et les exports utilisent les mêmes critères. Un compte sans modification reste au dénominateur. Un compte présent sur plusieurs projets compte une seule fois dans le total. « Au moins une modification pendant la période » ne démontre pas une activité continue ni une rétention à la date de fin.

Le chargement suit toutes les pages du journal, puis vérifie les comptes par lots de 50. Il peut être mis en pause et repris dans la même page. Les listes sont exportables en CSV et TXT, avec la date ou la plage dans le nom du fichier. Le CSV conserve aussi les dates d’inscription, les identifiants locaux et les exclusions. Il se réimporte depuis le champ de fichier de l’import principal, sans relire le journal ; les identifiants servent à rechercher les pseudos actuels. Le TXT conserve seulement les pseudos et la période dans son nom. L’analyse JSON conserve ensuite les dates de création, les critères d’observation et la progression de collecte. Le navigateur doit rester ouvert pendant les appels. Les cohortes mensuelles et les observations anciennes peuvent prendre longtemps ; aucune page n’est ignorée pour accélérer la collecte.

## Comprendre les résultats

Depuis les résultats, **Analyser les thématiques des articles** lance une analyse facultative de l’espace principal de Wikipédia. Le modèle multilingue de Wikimédia [`outlink-topic-model`](https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language_agnostic_link-based_article_topic), servi par Lift Wing, classe les articles grâce à leurs liens. Les scores de confiance d’au moins 0,5 sont retenus. Les thèmes concernent l’article dans son état actuel, pas le texte ajouté ni la version historique de la page. Les redirections, homonymies et pages inaccessibles aujourd’hui sont écartées.

Choisissez créations, modifications ou les deux, puis contributeurs, articles distincts ou contributions. Chaque valeur est accompagnée de son pourcentage et du total utilisé. Un contributeur ou article peut relever de plusieurs thèmes ; les pourcentages peuvent dépasser 100 % au total. Les scores du modèle ne sont jamais utilisés comme pourcentages de contributions. Les thèmes sont regroupés en huit grandes familles (plus les éventuels thèmes inconnus), avec les sous-thèmes disponibles à la demande.

La couverture distingue les articles classés, sans thème reconnu, indisponibles et encore à examiner. Le classement est en bêta et peut comporter des erreurs. Il reprend les filtres des résultats, reste indépendant de la collecte principale et interroge chaque article distinct à la demande. Pause et reprise conservent les résultats dans la page ; le JSON conserve les thèmes après une pause ou à la fin. Le CSV thématique conserve la mesure, le filtre, le dénominateur, la période et le modèle utilisés. Une courte explication et un lien vers la fiche officielle sont accessibles dans l’interface.

La question principale est : **combien de participants ont fait au moins une modification après l’événement ?**

Le bilan est cumulé du lendemain de la fin de l’événement jusqu’à l’échéance choisie incluse. Une modification à J+2 compte dans les résultats à J+30 et à J+90. Cela ne prouve pas que la personne contribue encore le jour de l’échéance, ni que l’événement a causé son activité ultérieure.

Une échéance future ou une collecte incomplète ne produit pas de taux définitif. Une absence d’observation n’est pas considérée comme une preuve d’inactivité. Les dates sont en UTC. Version méthodologique : **1.0**.

Les contributions sont des révisions publiques, pas le volume de texte ajouté ni un inventaire complet des téléversements ou journaux. Les révisions annulées restent des révisions observées. Le statut de nouveau compte dépend de la fenêtre de création sélectionnée ; un pseudo contenant « bot » ne suffit pas à identifier un bot.

## Sources et limites

- [CentralAuth](https://www.mediawiki.org/wiki/Extension:CentralAuth/API) : informations sur les comptes globaux et leurs comptes locaux rattachés.
- [API MediaWiki](https://www.mediawiki.org/wiki/API:Usercontribs) : contributions publiques, catalogue des projets et espaces de noms.
- [XTools](https://xtools.wmcloud.org/api) : contributions globales, avec recours à MediaWiki si nécessaire.
- [Programs & Events Dashboard](https://outreachdashboard.wmflabs.org) : listes publiques de participants et informations sur les événements.

Les API peuvent être indisponibles, retardées ou limiter les appels. Des révisions masquées et des comptes non rattachés peuvent manquer. La détection de l’automatisation est partielle. Un compte renommé n’est pas automatiquement relié à sa nouvelle identité. Les comptes très actifs peuvent nécessiter de nombreuses requêtes et beaucoup de mémoire dans le navigateur.

Les imports manuels ordinaires acceptent jusqu’à 1 000 comptes. Les TXT de cohorte nommés par le module peuvent contenir jusqu’à 100 000 comptes. Le module du journal n’applique pas cette limite ; la restauration JSON accepte jusqu’à 100 000 comptes. Les fichiers TXT, CSV et JSON sont acceptés jusqu’à 50 Mo. La collecte n’est pas tronquée silencieusement.

## Confidentialité

L’application ne demande aucun compte et n’utilise ni analytics ni cookies applicatifs. Seul le choix de langue est conservé localement. Les données d’analyse restent en mémoire de session, sauf export volontaire. Fermer ou recharger la page fait perdre les données non sauvegardées.

Le serveur ne conserve pas les cohortes de participants. Son cache partagé contient uniquement les informations publiques sur les projets et les espaces de noms. Les fournisseurs d’API publiques reçoivent les pseudos nécessaires aux recherches. L’infrastructure Toolforge applique ses propres règles de journalisation et de conservation.

## Maintenance et vérification

Le service fonctionne sur Toolforge.

Les tests automatiques vérifient les calculs, les erreurs de collecte et les interactions dans le navigateur avec des réponses API simulées. Ces données de test ne sont pas utilisées pour les analyses réelles. Les contrôles d’intégration avec les API publiques sont distincts.

## Crédit et licence

Créé par **[Mathieu Denel WMFR](https://meta.wikimedia.org/wiki/User:Mathieu_Denel_WMFr)** · Projet personnel.

Ce projet indépendant n’est pas un service officiel de la Fondation Wikimédia.

Distribué sous licence [GPL-3.0-or-later](LICENSE).
