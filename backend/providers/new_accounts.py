"""Page the public registration log, independently from contribution collection."""

from datetime import UTC, date, datetime, timedelta
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from backend.providers.transport import SourceError, Transport

FR = "https://fr.wikipedia.org/w/api.php"
# First full UTC day after the newusers/create format appeared on frwiki.
# The older newusers/newusers log cannot identify the target in the same way.
EARLIEST = date(2006, 4, 18)
ACTIONS = ("create", "create2", "byemail")


class RegistrationRequest(BaseModel):
    start: date
    end: date
    action: Literal["create", "create2", "byemail"] = "create"
    cursor: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def dates(self):
        if self.start < EARLIEST or self.end < self.start or self.end > datetime.now(UTC).date():
            raise ValueError("Période de création invalide")
        return self


class RegistrationCandidate(BaseModel):
    local_id: int | None = Field(default=None, ge=1)
    name: str = Field(min_length=1, max_length=255)
    timestamp: datetime
    log_id: int | None = Field(default=None, ge=1)


class RegistrationBatch(BaseModel):
    candidates: list[RegistrationCandidate] = Field(min_length=1, max_length=50)


def candidates_from_log(rows: list[dict]) -> tuple[list[dict], int]:
    output, unavailable = [], 0
    for row in rows:
        if row.get("action") not in ACTIONS:
            continue
        # The log actor is not necessarily the account being created (create2).
        title, details = row.get("title", ""), row.get("params", {})
        if row.get("ns") != 2 or ":" not in title or not row.get("timestamp"):
            unavailable += 1
            continue
        raw_id = details.get("userid", details.get("0"))
        try:
            local_id = int(raw_id) if raw_id else None
        except (ValueError, TypeError):
            local_id = None
        output.append(
            {
                "name": title.split(":", 1)[1],
                "local_id": local_id if local_id and local_id > 0 else None,
                "timestamp": row["timestamp"],
                "log_id": row["logid"],
            }
        )
    return output, unavailable


class NewAccountsProvider:
    def __init__(self, transport: Transport):
        self.transport = transport

    async def page(self, request: RegistrationRequest) -> dict:
        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "list": "logevents",
            "leaction": "newusers/" + request.action,
            # Log writes may follow actual account creation by a few seconds.
            # Check local registration dates after this boundary padding.
            "lestart": (
                datetime.combine(request.start, datetime.min.time(), UTC) - timedelta(minutes=1)
            )
            .isoformat()
            .replace("+00:00", "Z"),
            "leend": (
                datetime.combine(request.end, datetime.max.time().replace(microsecond=0), UTC)
                + timedelta(minutes=1)
            )
            .isoformat()
            .replace("+00:00", "Z"),
            "ledir": "newer",
            "lelimit": 500,
            "leprop": "title|type|timestamp|details|ids",
            "maxlag": 5,
        }
        if request.cursor:
            params["lecontinue"] = request.cursor
        data = await self.transport.get(FR, params, "mediawiki")
        rows = data.get("query", {}).get("logevents")
        if not isinstance(rows, list):
            raise SourceError("mediawiki", 502)
        candidates, unavailable = candidates_from_log(rows)
        return {
            "candidates": candidates,
            "unavailable": unavailable,
            "cursor": data.get("continue", {}).get("lecontinue"),
        }

    async def accounts(self, request: RegistrationBatch) -> dict:
        # IDs follow local renamings. Old log rows without an ID use the title.
        with_id = all(candidate.local_id for candidate in request.candidates)
        params = {
            "action": "query",
            "format": "json",
            "formatversion": 2,
            "list": "users",
            "usprop": "registration|centralids|tempexpired|groups",
            "ususerids" if with_id else "ususers": "|".join(
                str(c.local_id) if with_id else c.name for c in request.candidates
            ),
            "maxlag": 5,
        }
        data = await self.transport.get(FR, params, "mediawiki")
        rows = data.get("query", {}).get("users")
        if not isinstance(rows, list):
            raise SourceError("mediawiki", 502)
        output, excluded, unavailable = [], 0, []
        for candidate in request.candidates:
            row = next(
                (
                    r
                    for r in rows
                    if (
                        r.get("userid") == candidate.local_id
                        if with_id
                        else r.get("name") == candidate.name
                    )
                ),
                None,
            )
            if not row or "missing" in row or "invalid" in row:
                unavailable.append(candidate.name)
                continue
            # Active temporary accounts return False, expired ones True.
            # Registered accounts return null. Missing metadata is unknown.
            if "tempexpired" not in row:
                raise SourceError("mediawiki", 502)
            if isinstance(row["tempexpired"], bool) or row["name"].startswith("~"):
                excluded += 1
                continue
            if row["tempexpired"] is not None:
                raise SourceError("mediawiki", 502)
            groups = row.get("groups", [])
            timestamp = candidate.timestamp
            if row.get("registration"):
                local_registration = datetime.fromisoformat(
                    row["registration"].replace("Z", "+00:00")
                )
                if abs((local_registration - timestamp).total_seconds()) <= 60:
                    timestamp = local_registration
            output.append(
                {
                    "username": row["name"],
                    "registration": timestamp.isoformat().replace("+00:00", "Z"),
                    "local_id": row["userid"],
                    "global_id": row.get("centralids", {}).get("CentralAuth"),
                    "signup": {
                        "timestamp": timestamp.isoformat().replace("+00:00", "Z"),
                        "local_id": row["userid"],
                        "original_name": candidate.name,
                    },
                    "groups": groups,
                    "bot": "bot" in groups,
                }
            )
        return {"accounts": output, "excluded": excluded, "unavailable": unavailable}
