"""Read public CampaignEvents registrations. No authentication or private participants."""

import re
from datetime import UTC, datetime, timedelta, tzinfo
from datetime import timezone as fixed_timezone
from typing import Literal
from urllib.parse import parse_qs, quote, unquote, urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, Field

from backend.models import BatchRequest, normalize_name
from backend.providers.catalog import CatalogProvider, safe_domain
from backend.providers.transport import SourceError, Transport

PROVIDER = "event-registration"


class EventRequest(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class EventAccountsRequest(BaseModel):
    project: str = Field(min_length=1, max_length=100)
    event_id: int = Field(gt=0)
    kind: Literal["participants", "organizers"]
    cursor: int | None = Field(default=None, ge=0)


def parse_event_url(url: str) -> tuple[str, str, int | None]:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not safe_domain(parsed.hostname)
        or parsed.port not in {None, 443}
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Une page HTTPS d’un projet Wikimédia est requise")
    if parsed.path.startswith("/wiki/"):
        title = unquote(parsed.path[6:])
    elif parsed.path == "/w/index.php":
        titles = parse_qs(parsed.query).get("title", [])
        if len(titles) != 1:
            raise ValueError("Titre manquant")
        title = titles[0]
    else:
        raise ValueError("Page d’événement requise")
    if (
        not title
        or len(title) > 500
        or any(c in title for c in "\\?#[]{}|%")
        or any(ord(c) < 32 for c in title)
        or any(p in {".", ".."} for p in title.split("/"))
    ):
        raise ValueError("Titre invalide")
    match = re.fullmatch(r"Special:EventDetails/([1-9][0-9]*)", title, re.IGNORECASE)
    return parsed.hostname, title, int(match[1]) if match else None


def event_zone(value: str) -> tzinfo:
    match = re.fullmatch(r"([+-])([0-9]{2}):([0-9]{2})", value)
    if match:
        hours, minutes = int(match[2]), int(match[3])
        if hours > 23 or minutes > 59:
            raise ValueError("Fuseau invalide")
        offset = timedelta(hours=hours, minutes=minutes)
        return fixed_timezone(offset if match[1] == "+" else -offset)
    return ZoneInfo(value)


def event_time(value: str, timezone: str) -> datetime:
    try:
        local = datetime.strptime(value, "%Y%m%d%H%M%S")
        if local.strftime("%Y%m%d%H%M%S") != value:
            raise ValueError()
        return local.replace(tzinfo=event_zone(timezone)).astimezone(UTC)
    except (ValueError, TypeError, ZoneInfoNotFoundError) as error:
        raise SourceError(PROVIDER, 502) from error


class EventRegistrationProvider:
    def __init__(self, transport: Transport, catalog: CatalogProvider):
        self.transport = transport
        self.catalog = catalog

    async def event(self, request: EventRequest) -> dict:
        domain, title, event_id = parse_event_url(request.url)
        wiki = await self.catalog.resolve(domain)
        if event_id is None:
            # This public config value is supplied by CampaignEvents itself.
            # The HTML is never executed and no arbitrary outbound link is followed.
            html = await self.transport.get_html(
                f"https://{wiki['domain']}/wiki/{quote(title.replace(' ', '_'), safe=':/')}",
                PROVIDER,
            )
            match = re.search(r'"wgCampaignEventsEventID"\s*:\s*([1-9][0-9]*)\s*[,}]', html)
            if not match:
                raise ValueError("Cette page ne contient pas d’inscription Event Registration")
            event_id = int(match[1])
        data = await self.transport.get(
            f"https://{wiki['domain']}/w/rest.php/campaignevents/v0/event_registration/{event_id}",
            None,
            PROVIDER,
        )
        if data.get("id") != event_id or not isinstance(data.get("name"), str):
            raise SourceError(PROVIDER, 502)
        timezone = data.get("timezone")
        if not isinstance(timezone, str):
            raise SourceError(PROVIDER, 502)
        start = event_time(data.get("start_time"), timezone)
        end = event_time(data.get("end_time"), timezone)
        if end < start:
            raise SourceError(PROVIDER, 502)
        projects = data.get("wikis")
        if not isinstance(projects, list) or any(not isinstance(p, str) for p in projects):
            raise SourceError(PROVIDER, 502)
        catalog = await self.catalog.catalog()
        known = {p["id"] for p in catalog}
        return {
            "id": event_id,
            "project": wiki["id"],
            "title": data["name"],
            "url": f"https://{wiki['domain']}/wiki/Special:EventDetails/{event_id}",
            "page_url": f"https://{wiki['domain']}/wiki/{quote(str(data.get('event_page', title)).replace(' ', '_'), safe=':/')}",
            "start": start.date().isoformat(),
            "end": end.date().isoformat(),
            "starts_at": start.isoformat().replace("+00:00", "Z"),
            "ends_at": end.isoformat().replace("+00:00", "Z"),
            "timezone": timezone,
            "start_local": start.astimezone(event_zone(timezone)).strftime("%Y-%m-%d %H:%M"),
            "end_local": end.astimezone(event_zone(timezone)).strftime("%Y-%m-%d %H:%M"),
            "projects": [p for p in projects if p in known],
            "all_projects": "*" in projects,
            "public_only": True,
            "dates_confirmed": False,
            "unavailable": 0,
            "imported_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        }

    async def accounts(self, request: EventAccountsRequest) -> dict:
        wiki = await self.catalog.resolve(request.project)
        participant = request.kind == "participants"
        key = "participant_id" if participant else "organizer_id"
        params = {"include_private": "false"} if participant else {}
        if request.cursor is not None:
            params["last_" + key] = request.cursor
        rows = await self.transport.get_list(
            f"https://{wiki['domain']}/w/rest.php/campaignevents/v0/event_registration/"
            f"{request.event_id}/{request.kind}",
            params,
            PROVIDER,
        )
        accounts, unavailable, ids = [], 0, []
        for row in rows:
            if (
                not isinstance(row, dict)
                or type(row.get(key)) is not int
                or row[key] <= (request.cursor or 0)
            ):
                raise SourceError(PROVIDER, 502)
            ids.append(row[key])
            if row.get("private"):
                # Reject an unexpected privacy breach instead of passing the name to a client.
                raise SourceError(PROVIDER, 502)
            if row.get("hidden") or row.get("not_found") or not row.get("user_name"):
                unavailable += 1
                continue
            name = row["user_name"]
            if (
                not isinstance(name, str)
                or type(row.get("user_id")) is not int
                or row["user_id"] <= 0
            ):
                raise SourceError(PROVIDER, 502)
            try:
                BatchRequest(usernames=[name])
            except ValueError as error:
                raise SourceError(PROVIDER, 502) from error
            accounts.append(
                {
                    "username": normalize_name(name),
                    "global_id": row["user_id"],
                    "staff": not participant,
                    "included": participant,
                    "roles": ["participant" if participant else "organizer"],
                }
            )
        # Always ask for the next page, even for a short page. The API can omit
        # hidden accounts and has different page sizes for participants and organizers.
        return {
            "accounts": accounts,
            "cursor": max(ids) if ids else None,
            "unavailable": unavailable,
        }
