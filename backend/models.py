from datetime import date
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator, model_validator

Username = Annotated[str, Field(min_length=1, max_length=255)]


def normalize_name(value: str) -> str:
    import unicodedata

    value = unicodedata.normalize("NFC", value.replace("_", " ").strip())
    return value[:1].upper() + value[1:]


class BatchRequest(BaseModel):
    usernames: list[Username] = Field(min_length=1, max_length=50)

    @field_validator("usernames")
    @classmethod
    def names(cls, values: list[str]) -> list[str]:
        result = []
        for value in values:
            name = normalize_name(value)
            if not name or any(ord(c) < 32 or c in "|#<>[]{}" for c in name):
                raise ValueError("Nom de compte invalide")
            result.append(name)
        return result


class DashboardRequest(BaseModel):
    url: str = Field(max_length=2000)


class PageRequest(BatchRequest):
    project: str = Field(min_length=1, max_length=100)
    start: date
    end: date
    cursor: str | None = Field(default=None, max_length=1000)
    interactive: bool = False

    @model_validator(mode="after")
    def dates(self):
        if self.end < self.start or self.end > date.today():
            raise ValueError("Période invalide ou future")
        return self


class GlobalRequest(BaseModel):
    username: Username
    start: date
    end: date
    cursor: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def dates(self):
        self.username = BatchRequest(usernames=[self.username]).usernames[0]
        if self.end < self.start or self.end > date.today():
            raise ValueError("Période invalide ou future")
        if self.cursor:
            from datetime import datetime

            datetime.fromisoformat(self.cursor.replace("Z", "+00:00"))
        return self


class Contribution(BaseModel):
    username: str
    project: str
    revision: int
    timestamp: str
    namespace: int
    title: str = ""
    page_id: int | None = None
    new_page: bool | None = None
    category: Literal[
        "CONTENT", "STRUCTURED_DATA", "MEDIA", "MAINTENANCE", "COMMUNITY", "OTHER"
    ] = "OTHER"
    automation: Literal["normal", "bot", "detected", "unknown"] = "unknown"
    tags: list[str] = Field(default_factory=list)
    provider: str
