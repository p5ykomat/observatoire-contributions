from backend.providers.transport import Transport

META = "https://meta.wikimedia.org/w/api.php"


class CentralAuthProvider:
    def __init__(self, transport: Transport):
        self.transport = transport

    async def qualify(self, usernames: list[str]) -> list[dict]:
        data = await self.transport.get(
            META,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "list": "globalusers",
                "gususers": "|".join(usernames),
                "gusprop": "registration|editcount|groups|locked|localinfo",
                "maxlag": 5,
            },
            "centralauth",
        )
        rows = data.get("query", {}).get("globalusers")
        if not isinstance(rows, list):
            from backend.providers.transport import SourceError

            raise SourceError("centralauth", 502)
        output = []
        for row in rows:
            groups = row.get("groups", [])
            output.append(
                {
                    "username": row["name"],
                    "registration": row.get("registration"),
                    "global_id": row.get("centralid"),
                    "global_editcount": row.get("editcount"),
                    "groups": groups,
                    "locked": bool(row.get("locked", False)),
                    "exists": "missing" not in row and "invalid" not in row,
                    "invalid": "invalid" in row,
                    "bot": bool(set(groups) & {"global-bot", "bot", "local-bot"}),
                }
            )
        return output

    async def local_accounts(self, username: str) -> dict:
        data = await self.transport.get(
            META,
            {
                "action": "query",
                "format": "json",
                "formatversion": 2,
                "meta": "globaluserinfo",
                "guiuser": username,
                "guiprop": "merged|groups|editcount",
                "maxlag": 5,
            },
            "centralauth",
        )
        from backend.providers.transport import SourceError

        info = data.get("query", {}).get("globaluserinfo")
        if (
            not isinstance(info, dict)
            or "missing" in info
            or not isinstance(info.get("merged"), list)
        ):
            raise SourceError("centralauth", 502)
        return info
