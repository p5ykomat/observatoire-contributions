# Vérification du 7 octobre 2026

## Contrôles locaux

42 tests pytest réussis (2 tests d’intégration exclus), Ruff et son formatage validés. 56 tests Vitest réussis et 15 parcours Playwright réussis. TypeScript strict, ESLint et build Vite réussis. Le build charge les résultats et les exports séparément ; un avertissement de taille concerne le module de graphiques.

Les tests couvrent l’import TXT/CSV/JSON et Dashboard, la vérification intégrée à l’import, les exclusions réversibles, les dates réelles de l’événement, la fenêtre des nouveaux comptes, les listes de 733 comptes paginées, la pause, la reprise, l’annulation et la remise à zéro.

La question de résultats est cumulative : de J+1 jusqu’à J+X inclus ou jusqu’à aujourd’hui. Tests des bornes exactes, d’une contribution précoce conservée dans les échéances suivantes, de la saisie personnalisée, des échéances futures, des archives anciennes, des projets non collectés et des données incomplètes. Les filtres Wikipédia portent sur les langues et types de modifications ; les autres projets utilisent toutes les catégories. Les personnes sont comptées une fois au total et une fois par famille fréquentée. Les pourcentages précisent leur dénominateur.

La langue ne modifie ni les données ni les calculs et ne déclenche aucun appel API. Les fichiers français et anglais couvrent les mêmes clés et variables. Le PDF utilise la langue choisie et omet les noms par défaut. CSV, PDF, JSON et graphiques PNG/SVG ont été générés dans les parcours navigateur. Le JSON conserve les données et la question.

Axe ne signale aucune violation sur les vues testées : import, paramétrage, liste paginée, résultats français desktop et anglais desktop/mobile. Contrôles clavier et absence de débordement horizontal à 390 pixels. Cela ne remplace pas un audit exhaustif avec lecteurs d’écran.

## Revue d’interface

Direction Observatoire conservée. Revue locale avec better-ui, better-typography, better-colors, better-layout, better-accessibility, better-writing et react-best-practices. La skill better-interface étant absente, une revue équivalente quick vérifie hiérarchie, états partiels, interactions, focus, contraste, tableaux et responsive. Aucun asset externe nouveau ni aucune comparaison de directions n’est nécessaire pour cette direction déjà choisie.

## Sources publiques

Le programme Formation ED Lille avril 2026 expose un début au 26 février 2026 en UTC et une fin en 2052. L’événement réel confirmé par l’utilisateur est le 3 avril 2026. Les dates publiques de création des 18 comptes ont été vérifiées. Avec trois comptes d’organisation exclus et une fenêtre du 20 mars au 13 avril inclus, 12 comptes correspondent à la sélection de nouveaux comptes. Une fin future du Dashboard ne peut être utilisée comme fin de cet événement.

L’import réel du programme est fonctionnel. Les données publiques peuvent demeurer indisponibles ponctuellement. Le secours XTools est affiché une seule fois avec le nombre de comptes concernés. La couverture reste explicite, sans assimiler un échec à une inactivité.

## Publication

Le site conserve son adresse https://retention-wikimedia.vercel.app et son lien anglais https://retention-wikimedia.vercel.app/?lang=en. Toolforge reste une version annoncée à venir. Le dépôt de code cible est https://github.com/p5ykomat/observatoire-contributions. Atlas référence le site et cette adresse.

Contrôles de cette version depuis le domaine public : import Dashboard réel de Lille (18 comptes), vérification CentralAuth et fenêtre de nouveaux comptes (12 retenus sur 15 non exclus), catalogue, santé et requête XTools courte HTTP 200. Les échéances J+30, J+90, J+120, J+365, Aujourd’hui et la saisie personnalisée recalculent une archive synthétique sans appels API. Aucun échec JavaScript constaté ; Axe sans violation en français desktop et en anglais mobile.
