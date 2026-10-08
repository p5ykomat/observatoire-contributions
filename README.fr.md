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

## Comprendre les résultats

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

Les imports acceptent jusqu’à 1 000 comptes, des fichiers TXT/CSV de 2 Mo et des fichiers JSON de 50 Mo. La collecte n’est pas tronquée silencieusement.

## Confidentialité

L’application ne demande aucun compte et n’utilise ni analytics ni cookies applicatifs. Seul le choix de langue est conservé localement. Les données d’analyse restent en mémoire de session, sauf export volontaire. Fermer ou recharger la page fait perdre les données non sauvegardées.

Le serveur ne conserve pas les cohortes de participants. Son cache partagé contient uniquement les informations publiques sur les projets et les espaces de noms. Les fournisseurs d’API publiques reçoivent les pseudos nécessaires aux recherches. L’infrastructure Toolforge applique ses propres règles de journalisation et de conservation.

## Maintenance et vérification

Le service fonctionne sur Toolforge. Les instructions de maintenance figurent dans le [guide de déploiement et de vérification, en anglais](docs/TOOLFORGE.md).

Les tests automatiques vérifient les calculs, les erreurs de collecte et les interactions dans le navigateur avec des réponses API simulées. Ces données de test ne sont pas utilisées pour les analyses réelles. Les contrôles d’intégration avec les API publiques sont distincts ; les [notes de vérification](docs/verification.md) présentent les contrôles consignés et leurs limites.

## Crédit et licence

Créé par **[Mathieu Denel WMFR](https://meta.wikimedia.org/wiki/User:Mathieu_Denel_WMFr)** · Projet personnel.

Ce projet indépendant n’est pas un service officiel de la Fondation Wikimédia.

Distribué sous licence [GPL-3.0-or-later](LICENSE).
