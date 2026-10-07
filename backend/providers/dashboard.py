from urllib.parse import quote, unquote, urlparse

from backend.models import normalize_name
from backend.providers.transport import SourceError, Transport

HOSTS = {"outreachdashboard.wmflabs.org", "dashboard.wikiedu.org"}
STAFF = {"instructor", "staff", "volunteer", "online_volunteer", "organizer", "1", "2", "3", "4"}


def parse_dashboard(url: str) -> tuple[str, str]:
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or parsed.hostname not in HOSTS
        or parsed.port not in {None, 443}
        or parsed.username
        or parsed.password
    ):
        raise ValueError("Utilisez une URL HTTPS du Programs & Events Dashboard")
    parts = unquote(parsed.path).strip("/").split("/")
    if (
        len(parts) != 3
        or parts[0] != "courses"
        or any(p in {".", "..", ""} or "\\" in p for p in parts)
    ):
        raise ValueError("URL de programme invalide")
    return parsed.hostname, "/".join(parts[1:])


def participants(rows: list[dict]) -> list[dict]:
    output: dict[str, dict] = {}
    for row in rows:
        name = normalize_name(row.get("username", ""))
        if not name:
            continue
        role = str(row.get("role", "unknown")).lower()
        staff = role in STAFF or bool(row.get("program_manager") or row.get("content_expert"))
        item = output.setdefault(
            name,
            {
                "username": name,
                "roles": [],
                "staff": False,
                "role_conflict": False,
                "included": True,
            },
        )
        item["roles"].append(role)
        item["staff"] |= staff
        item["included"] = not item["staff"]
        item["role_conflict"] = (
            bool(set(item["roles"]) & {"0", "student", "participant"}) and item["staff"]
        )
    return list(output.values())


class DashboardProvider:
    def __init__(self, transport: Transport):
        self.transport = transport

    async def course(self, url: str) -> dict:
        host, slug = parse_dashboard(url)
        base = f"https://{host}/courses/{quote(slug, safe='/')}"
        info = await self.transport.get(base + "/course.json", None, "dashboard")
        users = await self.transport.get(base + "/users.json", None, "dashboard")
        course = info.get("course")
        rows = users.get("course", {}).get("users", users.get("users"))
        if not isinstance(course, dict) or not isinstance(rows, list):
            raise SourceError("dashboard", 502)
        return {
            "title": course.get("title", slug),
            "organization": course.get("school"),
            "start": course.get("start"),
            "end": course.get("end"),
            "home_wiki": course.get("home_wiki"),
            "slug": slug,
            "participants": participants(rows),
        }
