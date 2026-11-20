# Wikimedia Retention

[Français](README.fr.md) | **English**

## Use online

**[Open Wikimedia Retention on Toolforge](https://wikimedia-retention.toolforge.org/?lang=en)**. No installation or account is required.

An independent tool for studying public contribution activity after a training session, workshop, course or campaign. The interface is available in French and English.

## How it works

1. **Import participants** by pasting usernames, uploading a TXT or CSV file, or entering a public Programs & Events Dashboard URL. A saved JSON analysis can also be restored.
2. **Review exclusions** in the participant table. Selecting a checkbox prepares a change. Click **Apply selected exclusions** to confirm it, then verify the accounts and continue. Verification checks account existence, creation dates and bot status without collecting contributions.
3. **Set the scope**: actual event dates, participants, projects and treatment of automated edits. Dashboard dates must be confirmed or corrected. New accounts can be selected using an explicit account creation window.
4. **Collect contributions**, with progress, pause, resume and cancellation. Cancellation retains data already collected in the current session.
5. **Explore results** by follow-up period, project and contribution type. Export CSV, a reusable JSON analysis, PDF reports or PNG/SVG charts.

Changing language preserves the current analysis. Reinstating excluded accounts or expanding the selection may require additional collection. Narrowing the observed dates or projects recalculates results without new requests. When selected dates or projects have not been collected, a dedicated action retrieves missing data for that selection without automatically extending a historical period to today.

## Event Registration

An event page or `Special:EventDetails` URL imports public registrations through the [CampaignEvents API](https://www.mediawiki.org/w/index.php?api=campaignevents.v0&title=Special:RestSandbox). All available pages are followed. Private registrations are never requested: a person can hide their registration even when the event is public. This tool does not sign in with organizer permissions. Public organizers are identified separately and excluded by default; they can be included again. Failures preserve imported pages so the import can resume in the same page.

In **Configure**, confirm or correct the dates before collection. Supplied times and their time zone are shown and converted to UTC for analysis. Corrections do not change the source event. Declared contribution projects are suggested and remain editable: hosting registration on Meta does not make Meta a contribution project. JSON preserves provenance, original dates and analysis-date confirmation; CSV and PDF identify the public source.

## New registrations on French Wikipedia

This import source loads a single registration day or an inclusive date range. It pages the public log actions `create`, `create2` and `byemail`, using the target account rather than the log actor. IPs, active and expired temporary accounts, and automatic attachments are excluded. Local IDs follow renamed accounts when available.

The supported format starts on **18 April 2006**, the first full UTC day after `create` appeared on French Wikipedia. Older entries exist from September 2005 but are not supported. Later CentralAuth unification dates do not replace local signup dates. Earlier global registration dates reveal pre-existing accounts. Hidden entries and unavailable accounts are reported outside the analysable cohort.

Observe each account from its own signup until a chosen date, or during a date range after signup. The editable preset selects French, English and German Wikipedia, Commons, Wikidata, French Wiktionary and French Wikisource. Alternatively select all public projects in every language, or projects by family and language. Contribution type filters apply only to Wikipedia. Other projects count all public revisions, which are not a complete inventory of uploads or log actions.

Accounts identified as bots are excluded by default. The checkbox excluding edits flagged as bot or automated is visible and enabled by default in this flow. Collection counters refresh every two seconds without additional network requests. Discovering the projects where accounts contribute is shown separately from the number of fully processed accounts.

Contributions count from each account’s exact creation timestamp, including the same day, rather than starting on the next day. Collection time depends on projects and account activity; no fixed duration is advertised.

Text reports, charts and exports use the same criteria. Accounts with zero edits stay in the denominator. Accounts contributing to several projects count once overall. At least one edit during an interval does not establish continuous activity or retention on the deadline itself.

Every log page is followed and accounts are verified in batches of 50. Pause and resume work in the current page. Lists can be exported as CSV or TXT, with the registration date or range in the filename. CSV preserves individual signup dates, local IDs and exclusions. It imports through the main file input without rereading the log; IDs resolve current usernames. TXT preserves usernames and the range in its filename. Analysis JSON then preserves registration provenance, observation criteria and collection progress. The browser must stay open during requests. Monthly cohorts and historical observations may take substantial time; pages are not skipped to speed collection up.

## Understanding the results

Results are designed for desktop use. Accounts and contributions are separate units: an account counts once overall even across multiple projects. Filters recalculate from collected data. Additional collection is offered only for missing data in the selection.

A fixed **Wikipedia articles subsequently deleted** block at the start of results contains the two archive-inclusion checkboxes. They apply only to Wikipedia’s article namespace, not Commons or Wikidata. Contributions are counted by date: an edit made during the period can remain included if the page is deleted later. Reverted edits on existing pages still count. Hidden metadata remains inaccessible.

**Creations in Wikipedia’s article namespace** counts identified creations during the period, including selected deleted creations, redirects and disambiguation pages. Unknown creation types result in an explicitly marked minimum. Counting identified creations does not require the topic model.

**Contribution breakdown** shows volumes, shares and distinct accounts by project. Contribution shares sum to approximately 100% after rounding. The initially collapsed contributor list shows contributing accounts with sortable headings. Individual details and statistical account lists link to public contribution histories.

Global and individual **contribution calendars** open on demand, use UTC and display one year at a time, including leap years. Weekday statistics show volumes and shares of the total without an average selector. Missing data is distinguished from confirmed zero activity.

**Statistics** groups account activity and the status of created pages. Opening it triggers a separate public metadata check in batches. Totals are partitioned into accessible originals, deleted originals and unconfirmed states when present. Revision and page IDs follow renames and restorations. A different history root under the same title can confirm title reuse after deletion; this is a subset of deleted originals, not an additive category. An accessible page is not necessarily eligible for inclusion in Wikipedia. Status describes check time, not the end of the observation period, and can be refreshed. JSON preserves states and dates; CSV and PDF include available indicators.

The optional **Wikipedia article topics (beta)** subsection offers created or edited articles that remain accessible. Archived contributions, redirects and disambiguation pages are excluded independently of the general checkboxes. The unit is always distinct articles, not the topics of added text. Themes and subtopics include counts and percentages; articles can belong to multiple themes, so shares can exceed 100%.

Wikimedia’s multilingual [`outlink-topic-model`](https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language_agnostic_link-based_article_topic), served by Lift Wing, uses current article links and a confidence threshold of 0.5. It does not describe a historical revision. Analyse starts a fresh classification; pausing preserves partial results and unavailable articles can be retried separately. Final counts distinguish classified, unclassified and unavailable articles. Intermediate checks are not mixed with retained articles. Topic-service failures do not block contribution counts or other statistics.

The event workflow observes contributions from the day after the event ends through the selected deadline. This does not establish continuous activity, activity on the deadline or a causal effect of the event. The registration workflow observes from each account’s exact signup time or during an explicit interval. Dates use UTC. Methodology version: **1.0**.


## Enterprise and article topics

The [official access policy](https://meta.wikimedia.org/wiki/Wikimedia_Enterprise/Access) allows Enterprise calls without an account or authorization header from Toolforge, Cloud VPS and PAWS servers. This does not automatically apply to browsers, local computers or Vercel. Access from Toolforge still needs verification on the actual deployment.

The [Enterprise schema](https://enterprise.wikimedia.com/docs/data-dictionary/) provides structured content, editorial categories, metadata and revision signals. Categories are not the 64 labels of `outlink-topic-model`; no equivalent field was found in the consulted schema. Enterprise therefore does not automatically replace Lift Wing or historical contribution lookup per account. A topic-service failure leaves account counts, contribution totals, filters and retention exports usable.

Questions prepared for the Foundation, without automatically sending them: is there an Enterprise topic classifier comparable to `outlink-topic-model`? Which model, version, taxonomy and languages does it use, including for recent articles? Which rate and caching rules apply to unauthenticated Toolforge access? Categories could provide optional enrichment, but grouping them into broad topics would require a separate evaluated method.

## Sources and limits

- [CentralAuth](https://www.mediawiki.org/wiki/Extension:CentralAuth/API): global account information and attached local accounts.
- [MediaWiki APIs](https://www.mediawiki.org/wiki/API:Usercontribs): public contributions, project catalogue and namespaces.
- [XTools](https://xtools.wmcloud.org/api): global contributions, with a MediaWiki fallback when needed.
- [Programs & Events Dashboard](https://outreachdashboard.wmflabs.org): public participant lists and event information.

APIs may be unavailable, delayed or rate limited. Hidden revisions and unattached accounts may be missing. Automation detection is partial. Renamed accounts are not automatically linked to a new identity. Very active accounts may require many requests and substantial browser memory.

Ordinary manual imports support up to 1,000 accounts. Cohort TXT files named by the module can contain up to 100,000 accounts. The registration log module does not apply this limit; JSON restoration accepts up to 100,000 accounts. TXT, CSV and JSON files up to 50 MB are accepted. Collection is not silently truncated.

## Privacy

The application requires no user account and uses no analytics or application cookies. Only the language preference is saved locally. Analysis data stays in session memory unless you explicitly export it. Reloading or closing the page loses unsaved analysis data.

The backend does not persist participant cohorts. Its shared cache contains only public project and namespace information. Public API providers receive the usernames needed for queries. Toolforge infrastructure has its own logging and retention policies.

## Maintenance and verification

The service runs on Toolforge.

Automated tests cover calculations, collection errors and browser interactions using simulated API responses. These test fixtures are not used for live analyses. Public API integration checks are separate.

## Credit and license

Created by **[Mathieu Denel WMFR](https://meta.wikimedia.org/wiki/User:Mathieu_Denel_WMFr)** · Personal project.

This independent project is not an official Wikimedia Foundation service.

Licensed under [GPL-3.0-or-later](LICENSE).
