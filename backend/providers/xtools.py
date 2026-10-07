from urllib.parse import quote

from backend.models import GlobalRequest
from backend.providers.transport import SourceError, Transport


class XToolsGlobalContributionsProvider:
    def __init__(self, transport: Transport):
        self.transport = transport

    async def page(self, request: GlobalRequest) -> dict:
        # Timestamp continuation, not an integer offset (current public API).
        url = f"https://xtools.wmcloud.org/api/user/globalcontribs/{quote(request.username, safe='')}/all/{request.start}/{request.end}"
        if request.cursor:
            url += "/" + quote(request.cursor, safe="")
        data = await self.transport.get(url, {"limit": 500}, "xtools")
        rows = data.get("globalcontribs")
        if not isinstance(rows, list):
            raise SourceError("xtools", 502)
        return {"rows": rows, "cursor": data.get("continue"), "provider": "xtools"}
