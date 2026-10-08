# Wikimedia Retention on Toolforge

The application uses Python 3.13 and FastAPI to query public APIs. Node.js 22 builds the React frontend during image creation. FastAPI then serves both the API and the compiled frontend on port 8000. No database or persistent cohort storage is required.

The root package.json, requirements.txt, .python-version and Procfile support the Toolforge Build Service. See the [official multi-runtime instructions](https://wikitech.wikimedia.org/wiki/Help:Toolforge/Building_container_images#Using_Node.js_in_addition_to_another_language).

After creating the tool account and public GitLab repository named `wikimedia-retention`, push the source code and run these commands as that tool account:

```sh
toolforge build start https://gitlab.wikimedia.org/toolforge-repos/wikimedia-retention.git
```

Wait for a successful build, then start the service:

```sh
toolforge webservice buildservice start --mount=none
```

For an update, push the code, build again, then use `toolforge webservice buildservice restart --mount=none`.

## Verify after deployment

Check `/api/health`, load the interface in French and English, import a small public cohort, apply selected exclusions, qualify the accounts, and collect a short historical period. Check the counts against the public contribution history and test CSV and JSON exports. Test the public Dashboard import separately. Report source API failures as incomplete data rather than zero activity.

The app disables access logging and does not save cohorts on the server. Infrastructure logging is managed separately by Toolforge. Do not commit local analysis exports, private configuration or credentials.
