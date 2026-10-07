# Contribuer

Ce projet est sous GPL-3.0-or-later. Les contributions doivent être compatibles avec cette licence. Documenter les dépendances, licences et sources publiques utilisées.

Installer les dépendances de développement selon le README. Exécuter pytest, Ruff, Vitest, ESLint, TypeScript/Vite et les tests Playwright pertinents avant une proposition de changement. La CI ne lance pas les tests contre les services publics.

Une correction de méthode doit ajouter un scénario synthétique précis, rendre les bornes explicites et envisager une nouvelle version méthodologique. Une modification du schéma d’archivage doit être versionnée ou migrée explicitement. Une collecte incomplète ne doit jamais produire une inactivité certaine ni un taux définitif.

Les textes d’interface sont centralisés dans `frontend/src/locales/fr.json`. Conserver la langue française complète, les accents, les labels et les focus visibles. Les graphiques doivent toujours disposer d’un équivalent tabulaire et d’exports. Ne pas introduire d’analytics, de stockage nominatif implicite ou de ressources distantes frontend.

Ne pas ajouter de noms réels de participants, d’exports nominatifs, de jetons ou de secrets dans les fixtures, captures ou journaux. Les exemples utilisent des comptes synthétiques. Pour signaler un changement d’API, joindre le provider, le statut et le format anonymisé plutôt qu’un corps contenant une cohorte réelle.

Formatage : `python -m ruff format backend tests scripts` et `npx --prefix frontend prettier --write frontend/src frontend/browser-tests`. La logique pure se trouve dans `frontend/src/analysis`, les adaptateurs publics dans `backend/providers`. Garder le même code pour Vercel et Toolforge.
