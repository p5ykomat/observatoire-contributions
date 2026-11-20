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

La page de résultats est conçue pour une utilisation sur ordinateur. Les réglages sont repliés au départ pour mettre le bilan en premier. Le bilan, les graphiques, les listes et les calendriers suivent les mêmes filtres. « A contribué » désigne les comptes ayant au moins une contribution éligible dans cette sélection ; « N’a pas contribué » signifie qu’aucune contribution n’a été trouvée dans une collecte complète. Le nombre de comptes avec des données à compléter apparaît uniquement lorsqu’il est supérieur à zéro.

**Répartition des contributions** détaille le total par projet, avec le nombre de contributions, leur part et les comptes distincts. Chaque contribution appartient à un seul projet : les parts totalisent 100 %. Les comptes sont dédoublonnés dans le total général, mais un même compte peut apparaître sur plusieurs projets. Les créations et modifications d’articles Wikipédia sont distinguées lorsque leur type est connu. Le détail dépliable liste les pages, pseudos, dates UTC et liens vers les révisions ou les journaux publics.

Le **calendrier des contributions**, replié au départ, montre les volumes par journée et le détail d’un jour sélectionné. Une année est affichée à la fois. Les mois, années bissextiles et périodes longues sont pris en charge. La comparaison des jours de semaine peut afficher les contributions totales ou leur moyenne par journée observée, afin de ne pas avantager un jour qui apparaît plus souvent dans la période. Un calendrier individuel est accessible dans le détail de chaque compte. Les dates et heures sont en UTC. Les données manquantes ne sont pas représentées comme une absence certaine d’activité.

**Autres chiffres clés** présente uniquement des indicateurs issus des contributions observées : journées actives, journée et tranche horaire les plus actives, moyenne par compte actif, comptes avec une seule contribution et comptes présents sur plusieurs wikis ou familles de projets. Les pourcentages utilisent les comptes ayant contribué comme base. Il ne contient pas de décompte historique des blocages, renommages ou comptes supprimés, ni de comparaison des octets ajoutés et retirés.

La liste des contributeurs précède les thématiques. Repliée au départ, elle affiche uniquement les comptes ayant contribué. Les en-têtes permettent de trier par pseudo, nombre de contributions ou date de dernière contribution, dans les deux sens. L’affichage de tous les comptes reste disponible pour vérifier les absences d’activité et les exclusions.

La collecte recherche automatiquement les métadonnées publiques des créations et modifications d’articles Wikipédia ensuite supprimés. Deux cases, cochées par défaut dans les résultats, permettent de les inclure ou de les exclure séparément. Les nombres, pourcentages, listes et graphiques se recalculent sans nouvelle requête. Les modifications annulées sur un article conservé restent comptées, indépendamment de ces deux cases.

La période concerne la date de la contribution. Le statut supprimé correspond aux révisions archivées au moment de la collecte. Les métadonnées masquées restent inaccessibles. Si une source ne répond pas ou ne permet pas de distinguer créations et modifications, l’interface le signale au lieu d’affirmer une absence d’activité. Les anciennes analyses JSON restent lisibles ; une collecte complémentaire est nécessaire pour récupérer leurs contributions supprimées. Le JSON conserve les données archivées, les filtres et les curseurs de reprise.

Depuis les résultats, **Analyser les thématiques des articles** lance une analyse facultative de l’espace principal de Wikipédia. Le modèle multilingue de Wikimédia [`outlink-topic-model`](https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language_agnostic_link-based_article_topic), servi par Lift Wing, classe les articles grâce à leurs liens. Les scores de confiance d’au moins 0,5 sont retenus. Les thèmes concernent l’article dans son état actuel, pas le texte ajouté ni la version historique de la page. Les redirections, homonymies et pages inaccessibles aujourd’hui sont écartées.

Choisissez créations (sélection par défaut), modifications ou les deux, puis lancez l’analyse. La mesure est toujours le nombre d’articles distincts, avec son pourcentage et son dénominateur. Un article peut relever de plusieurs thèmes ; les pourcentages peuvent dépasser 100 % au total. Les scores du modèle ne sont jamais utilisés comme pourcentages de contributions. Les thèmes sont regroupés en huit grandes familles (plus les éventuels thèmes inconnus), avec les sous-thèmes disponibles à la demande.

Le bloc thématique est replié au départ. Changer la sélection masque l’ancien résultat jusqu’au lancement de la nouvelle analyse. « Réessayer les articles indisponibles » ne reprend que les échecs ; « Recommencer l’analyse thématique à zéro » réinterroge les articles de la sélection, sans relancer la collecte des comptes.

La couverture distingue les articles classés, sans thème reconnu, indisponibles et encore à examiner. Le classement est en bêta et peut comporter des erreurs. Il reprend les filtres des résultats, reste indépendant de la collecte principale et interroge chaque article distinct à la demande. Pause et reprise conservent les résultats dans la page ; le JSON conserve les thèmes après une pause ou à la fin. Le CSV thématique conserve la mesure, le filtre, le dénominateur, la période et le modèle utilisés. Une courte explication et un lien vers la fiche officielle sont accessibles dans l’interface.

Les articles supprimés inclus restent dans les dénominateurs, sans thématique attribuée. Le modèle ne reçoit ni leur contenu supprimé ni une page recréée sous le même titre. Décocher leur inclusion recalcule aussi les pourcentages thématiques. Par défaut, le modèle est appelé pour les créations d’articles accessibles. Leurs métadonnées publiques sont récupérées via `alldeletedrevisions` et les créations sont identifiées avec XTools Pages Created.

La question principale est : **combien de participants ont fait au moins une modification après l’événement ?**

Le bilan est cumulé du lendemain de la fin de l’événement jusqu’à l’échéance choisie incluse. Une modification à J+2 compte dans les résultats à J+30 et à J+90. Cela ne prouve pas que la personne contribue encore le jour de l’échéance, ni que l’événement a causé son activité ultérieure.

Une échéance future ou une collecte incomplète ne produit pas de taux définitif. Une absence d’observation n’est pas considérée comme une preuve d’inactivité. Les dates sont en UTC. Version méthodologique : **1.0**.

Les contributions sont des révisions publiques, pas le volume de texte ajouté ni un inventaire complet des téléversements ou journaux. Les révisions annulées restent des révisions observées. Le statut de nouveau compte dépend de la fenêtre de création sélectionnée ; un pseudo contenant « bot » ne suffit pas à identifier un bot.

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
