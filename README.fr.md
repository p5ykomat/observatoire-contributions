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

Le changement de langue conserve l’analyse en cours. Réintégrer des comptes exclus ou élargir la sélection peut nécessiter une collecte complémentaire. Réduire la période ou les projets observés recalcule les résultats sans nouvelle requête. Si la sélection demande des dates ou des projets encore non collectés, un bouton propose de rechercher les données manquantes pour cette sélection, sans prolonger automatiquement la période jusqu’à aujourd’hui.

## Event Registration

Une URL de page d’événement ou de `Special:EventDetails` permet d’importer les inscriptions publiques via l’[API CampaignEvents](https://www.mediawiki.org/w/index.php?api=campaignevents.v0&title=Special:RestSandbox). Toutes les pages disponibles sont parcourues. Les inscriptions privées ne sont pas demandées : une personne peut masquer son inscription même si l’événement est public. Cet outil ne dispose pas de connexion aux droits des organisateurs. Les organisateurs publics sont identifiés séparément et exclus par défaut, avec la possibilité de les réintégrer. Un échec conserve les pages déjà chargées pour reprendre dans la même page.

Dans **Paramétrer**, confirmez ou corrigez les dates avant la collecte. Les horaires et le fuseau fournis sont affichés, puis convertis en UTC pour l’analyse. Corriger ces dates ne modifie pas l’événement source. Les projets de contribution déclarés sont proposés et restent modifiables : une page d’inscription hébergée sur Meta ne signifie pas que les contributions ont lieu sur Meta. Le JSON conserve la provenance, les dates originales et la confirmation des dates de l’analyse ; les CSV et PDF indiquent la source publique.

## Nouveaux inscrits sur Wikipédia en français

Cette source d’import charge les comptes créés un jour précis ou entre deux dates incluses. Le module utilise les actions `create`, `create2` et `byemail` du journal public. Les IP, les comptes temporaires (actifs ou expirés) et les rattachements automatiques sont exclus. Le compte créé est identifié à partir de la cible du journal, pas du compte qui a effectué la création. Les identifiants locaux permettent de retrouver les comptes renommés lorsqu’ils sont disponibles.

Le format pris en charge commence le **18 avril 2006**, premier jour UTC complet après l’apparition de l’action `create` dans le journal de Wikipédia en français. Des entrées plus anciennes existent depuis septembre 2005, mais leur format n’est pas pris en charge. Les dates d’unification CentralAuth, parfois postérieures à l’inscription locale, ne remplacent pas la date du journal. Une date globale antérieure à l’inscription locale révèle un compte déjà existant. Les entrées masquées ou les comptes introuvables sont signalés et restent hors du groupe analysable.

Après import, choisissez l’observation depuis l’inscription propre à chaque compte jusqu’à une date, ou sur une plage de dates après son inscription. La sélection rapide propose Wikipédia francophone, anglophone et germanophone, Commons, Wikidata, Wiktionnaire francophone et Wikisource francophone. Chaque projet peut être décoché. Les autres modes couvrent tous les projets publics et toutes les langues, ou une sélection par famille et langue.

Les comptes identifiés comme bots sont exclus par défaut. La case d’exclusion des modifications marquées bot ou automatisées est visible et cochée par défaut dans ce parcours. Les compteurs de collecte sont actualisés toutes les deux secondes, sans requête supplémentaire. La recherche des projets où les comptes contribuent est affichée séparément du nombre de comptes entièrement traités.

Les contributions sont comptées dès l’instant de création de chaque compte, y compris le jour même, et non à partir de J+1. La durée de collecte dépend des projets et de l’activité des comptes ; aucune durée fixe n’est annoncée.

Les types de pages choisis filtrent uniquement Wikipédia. Tous les types de révisions publiques des autres projets sont pris en compte. Une contribution est une révision publique, y compris sur Commons, et non chaque opération de téléversement ou chaque entrée de journal.

Le bilan textuel, les graphiques et les exports utilisent les mêmes critères. Un compte sans modification reste au dénominateur. Un compte présent sur plusieurs projets compte une seule fois dans le total. « Au moins une modification pendant la période » ne démontre pas une activité continue ni une rétention à la date de fin.

Le chargement suit toutes les pages du journal, puis vérifie les comptes par lots de 50. Il peut être mis en pause et repris dans la même page. Les listes sont exportables en CSV et TXT, avec la date ou la plage dans le nom du fichier. Le CSV conserve aussi les dates d’inscription, les identifiants locaux et les exclusions. Il se réimporte depuis le champ de fichier de l’import principal, sans relire le journal ; les identifiants servent à rechercher les pseudos actuels. Le TXT conserve seulement les pseudos et la période dans son nom. L’analyse JSON conserve ensuite les dates de création, les critères d’observation et la progression de collecte. Le navigateur doit rester ouvert pendant les appels. Les cohortes mensuelles et les observations anciennes peuvent prendre longtemps ; aucune page n’est ignorée pour accélérer la collecte.

## Comprendre les résultats

Les résultats sont conçus pour une utilisation sur ordinateur. Le bilan distingue comptes et contributions : un compte figure une seule fois dans le total, même s’il contribue sur plusieurs projets. Les filtres recalculent les résultats avec les données collectées ; une collecte complémentaire est proposée seulement pour les données manquantes de la sélection.

Un bloc fixe **Articles Wikipédia ensuite supprimés**, au début des résultats, contient les deux cases d’inclusion des créations et modifications archivées après suppression. Elles concernent uniquement l’espace article de Wikipédia, pas Commons ou Wikidata. Les contributions sont comptées à leur date : une édition dans la période peut être incluse même si la page est supprimée plus tard. Les modifications annulées sur un article existant restent comptées. Les métadonnées masquées sont inaccessibles.

Le compteur **Créations dans l’espace article** donne les créations identifiées pendant la période, dont celles ensuite supprimées et incluses dans les résultats. Il comprend les redirections et homonymies. Si certains types sont inconnus, il indique explicitement un minimum. Aucun appel au modèle thématique n’est nécessaire pour compter les créations identifiées.

La **Répartition des contributions** indique les volumes et parts par projet et les comptes distincts. Les parts des contributions totalisent environ 100 % après arrondi. La liste des contributeurs est repliée au départ et affiche les comptes ayant contribué, avec tri par en-têtes. Leurs fiches et les listes statistiques donnent accès aux historiques publics de contributions.

Le **Calendrier des contributions** se déplie à la demande, globalement ou par compte. Les journées utilisent UTC et une année s’affiche à la fois, années bissextiles comprises. Le bilan par jour de semaine présente les volumes et leur part du total, sans sélecteur de moyenne. Les données manquantes ne sont pas considérées comme une absence certaine d’activité.

**Statistiques** regroupe les chiffres d’activité et l’état des pages créées. À son ouverture, un contrôle public séparé du modèle vérifie les créations par lots. Le total se répartit entre pages accessibles, pages d’origine supprimées et états non confirmés, lorsqu’il y en a. Les identifiants de révision et de page suivent les renommages et restaurations. Un nouveau début d’historique sous le même titre peut confirmer une réutilisation après suppression : ce chiffre est un sous-ensemble des suppressions, pas une catégorie à additionner. Une page accessible n’est pas nécessairement admissible. L’état correspond au contrôle, pas à la fin de l’observation, et peut être actualisé. Le JSON conserve les états et leurs dates ; CSV et PDF reprennent les indicateurs disponibles.

La sous-section facultative **Thématiques des articles Wikipédia (bêta)** propose les articles créés ou modifiés encore accessibles. Les contributions archivées après suppression, redirections et homonymies sont exclues de ce module, indépendamment des deux cases du bilan général. La mesure est toujours l’article distinct, pas le thème du texte ajouté. Thèmes et sous-thèmes présentent nombres et pourcentages ; un article peut appartenir à plusieurs thèmes, donc leur somme peut dépasser 100 %.

Le modèle multilingue de Wikimédia [`outlink-topic-model`](https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language_agnostic_link-based_article_topic), servi par Lift Wing, utilise les liens actuels des articles et un seuil de confiance de 0,5. Il ne décrit pas une version historique. « Analyser » permet un nouveau classement ; une pause conserve les résultats partiels et les articles indisponibles peuvent être réessayés séparément. Le bilan final distingue articles classés, sans thème reconnu et indisponibles. Les vérifications intermédiaires ne sont plus mélangées aux articles retenus. Une panne thématique ne bloque ni les contributions ni les autres statistiques.

Le parcours événement demande combien de participants ont fait au moins une contribution du lendemain de la fin de l’événement jusqu’à l’échéance incluse. Cela ne prouve ni activité continue, ni présence le dernier jour, ni effet causal de l’événement. Le parcours des nouveaux inscrits observe depuis l’inscription individuelle, heure comprise, ou sur une plage explicite. Les dates sont en UTC. Version méthodologique : **1.0**.


## Enterprise et classement thématique

La [documentation officielle](https://meta.wikimedia.org/wiki/Wikimedia_Enterprise/Access) permet les appels à Enterprise sans compte ni en-tête d’autorisation depuis les serveurs Toolforge, Cloud VPS ou PAWS. Cela ne s’applique pas automatiquement au navigateur, à un ordinateur local ou à Vercel. L’accès depuis Toolforge reste à vérifier sur le déploiement réel.

Le [schéma Enterprise](https://enterprise.wikimedia.com/docs/data-dictionary/) apporte du contenu structuré, des catégories éditoriales, des métadonnées et des signaux sur les révisions. Les catégories ne sont pas les 64 thèmes du modèle `outlink-topic-model`. Aucun champ équivalent n’a été trouvé dans le schéma consulté. Enterprise n’est donc pas utilisé comme remplacement automatique de Lift Wing et ne remplace pas la recherche historique des contributions par compte. Une panne du classement thématique laisse les comptes, les totaux de contributions, les filtres et les exports de rétention utilisables.

Questions préparées pour la Fondation, sans envoi automatique : existe-t-il un classement thématique Enterprise comparable à `outlink-topic-model` ? Quels modèle, version, taxonomie et langues utilise-t-il, notamment pour les articles récents ? Quels débits et règles de cache s’appliquent à l’accès sans authentification depuis Toolforge ? Les catégories seraient utiles pour un enrichissement facultatif, mais leur regroupement en grandes thématiques demanderait une méthode distincte et évaluée.

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
