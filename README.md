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

Changing language preserves the current analysis. Reinstating excluded accounts or expanding the selection may require additional collection. Changing collection dates or projects requires a new collection.

## Understanding the results

The main question is: **how many participants made at least one edit after the event?**

Results are cumulative from the day after the event ends through the chosen deadline, inclusive. An edit on day 2 counts in both the day 30 and day 90 results. This does not establish that a participant is still active on the deadline itself, or that the event caused their later activity.

Future deadlines and incomplete collections do not produce a definitive rate. Missing observations are not treated as proof of inactivity. Dates use UTC. Methodology version: **1.0**.

Contributions are public revisions, not the amount of text added or a complete inventory of uploads and logs. Reverted revisions remain observed revisions. New account status depends on the selected creation window; a username containing “bot” is not sufficient to identify a bot.

## Sources and limits

- [CentralAuth](https://www.mediawiki.org/wiki/Extension:CentralAuth/API): global account information and attached local accounts.
- [MediaWiki APIs](https://www.mediawiki.org/wiki/API:Usercontribs): public contributions, project catalogue and namespaces.
- [XTools](https://xtools.wmcloud.org/api): global contributions, with a MediaWiki fallback when needed.
- [Programs & Events Dashboard](https://outreachdashboard.wmflabs.org): public participant lists and event information.

APIs may be unavailable, delayed or rate limited. Hidden revisions and unattached accounts may be missing. Automation detection is partial. Renamed accounts are not automatically linked to a new identity. Very active accounts may require many requests and substantial browser memory.

Imports support up to 1,000 accounts, TXT/CSV files up to 2 MB and JSON files up to 50 MB. Collection is not silently truncated.

## Privacy

The application requires no user account and uses no analytics or application cookies. Only the language preference is saved locally. Analysis data stays in session memory unless you explicitly export it. Reloading or closing the page loses unsaved analysis data.

The backend does not persist participant cohorts. Its shared cache contains only public project and namespace information. Public API providers receive the usernames needed for queries. Toolforge infrastructure has its own logging and retention policies.

## Maintenance and verification

The service runs on Toolforge. See the [deployment and verification guide](docs/TOOLFORGE.md) for maintenance instructions.

Automated tests cover calculations, collection errors and browser interactions using simulated API responses. These test fixtures are not used for live analyses. Public API integration checks are separate; see the [verification notes, in French](docs/verification.md) for recorded checks and limitations.

## Credit and license

Created by **[Mathieu Denel WMFR](https://meta.wikimedia.org/wiki/User:Mathieu_Denel_WMFr)** · Personal project.

This independent project is not an official Wikimedia Foundation service.

Licensed under [GPL-3.0-or-later](LICENSE).
