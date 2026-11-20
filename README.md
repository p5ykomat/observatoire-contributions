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

The results page is designed for desktop use. Settings start collapsed so the observation summary appears first. The summary, charts, lists and calendars use the same filters. Contributing accounts have at least one eligible contribution in the selection. Accounts with no contributions are only classified as inactive when collection is complete. The incomplete-data category is hidden when its count is zero.

**Contribution breakdown** shows contributions, their share and distinct accounts by project. Each contribution belongs to exactly one project, so shares sum to 100%. Accounts are deduplicated overall but may appear on multiple projects. Wikipedia article creations and edits are distinguished when their type is known. Expandable details provide page titles, usernames, UTC timestamps and public revision or deletion-log links.

The initially collapsed **contribution calendar** shows daily volumes and details for a selected date. It displays one year at a time, supports leap years and long periods, and provides weekday totals or averages per observed weekday occurrence. Each account also has an expandable individual calendar. All dates and times use UTC. Missing data is distinguished from confirmed zero activity.

**Other key figures** uses only observed contributions: active days, busiest day and UTC hour, mean per active account, accounts with exactly one contribution and accounts active across multiple wikis or project families. Percentages use contributing accounts as their denominator. This block does not report historical blocks, renames, deleted accounts or added-versus-removed byte counts.

The contributor list appears above article topics, starts collapsed and initially shows only accounts with contributions. Column headings sort by username, contribution count or latest contribution date in either direction. Showing all accounts remains available to inspect inactivity and exclusions.

Collection automatically retrieves public metadata for Wikipedia article creations and edits that were subsequently deleted. Two result checkboxes are enabled by default. Toggling them separately recalculates counts, percentages, lists and charts without additional requests. Reverted edits on articles that still exist remain counted independently of these checkboxes.

The observation interval applies to edit timestamps. Deleted status means the revision was archived when collected. Hidden metadata remains inaccessible. Unavailable sources or uncertain creation types are reported rather than treated as inactivity. Older JSON analyses remain readable; collect again to retrieve their deleted contributions. JSON preserves archive metadata, filters and resume cursors.

In the results, **Analyse article topics** starts optional analysis of Wikipedia’s main namespace. Wikimedia’s multilingual [`outlink-topic-model`](https://meta.wikimedia.org/wiki/Machine_learning_models/Production/Language_agnostic_link-based_article_topic), served by Lift Wing, uses article links to estimate topics. Scores of at least 0.5 are retained. Topics concern the current article, not the text added or the historical version. Redirects, disambiguations and currently inaccessible pages are excluded.

Choose creations (the default), edits or both and start the analysis. The measure is always distinct articles, with counts, percentages and their denominator. Topics are grouped into eight broad themes, plus any unknown themes; subtopics are optional. Articles may appear in several topics, so percentages can sum to more than 100%. Model confidence scores are never treated as contribution percentages. Classification is beta and can be incorrect.

The topic block starts collapsed. Changing the selection hides the old result until analysis is started again. Retrying unavailable articles only retries failures; restarting topic analysis from scratch requests every article in the current selection again without recollecting account contributions.

Coverage distinguishes classified articles, articles with no recognised topic, unavailable sources and articles still to examine. Analysis follows the result filters and runs only on request, separately from contribution collection. Pause and resume preserve examined articles in the page; JSON preserves them after a pause or at completion. Topic CSV includes the measure, filter, denominator, period and model. A short explanation and the official model card are directly accessible in the interface.

Included deleted articles remain in the denominators without an assigned topic. The model receives neither deleted text nor an unrelated page recreated under the same title. Excluding them also recalculates topic percentages. By default, model inference covers accessible article creations. Public archived revision metadata comes from `alldeletedrevisions`; XTools Pages Created identifies creations.

The main question is: **how many participants made at least one edit after the event?**

Results are cumulative from the day after the event ends through the chosen deadline, inclusive. An edit on day 2 counts in both the day 30 and day 90 results. This does not establish that a participant is still active on the deadline itself, or that the event caused their later activity.

Future deadlines and incomplete collections do not produce a definitive rate. Missing observations are not treated as proof of inactivity. Dates use UTC. Methodology version: **1.0**.

Contributions are public revisions, not the amount of text added or a complete inventory of uploads and logs. Reverted revisions remain observed revisions. New account status depends on the selected creation window; a username containing “bot” is not sufficient to identify a bot.

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
