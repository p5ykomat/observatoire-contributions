from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from backend.providers.new_accounts import (
    NewAccountsProvider,
    RegistrationBatch,
    RegistrationRequest,
    candidates_from_log,
)
from backend.providers.transport import SourceError, Transport


def candidate(local_id=101, name="RegisteredAccount"):
    return {"local_id": local_id, "name": name, "timestamp": "2026-01-13T10:00:00Z", "log_id": 1}


def test_log_target_is_not_the_actor_and_legacy_id_is_supported():
    result, missing = candidates_from_log(
        [
            {
                "action": "create2",
                "user": "Creator",
                "userid": 9,
                "ns": 2,
                "title": "Utilisateur:CreatedAccount",
                "params": {"userid": 101},
                "timestamp": "2026-01-13T10:00:00Z",
                "logid": 1,
            },
            {
                "action": "create",
                "ns": 2,
                "title": "Utilisateur:HistoricalAccount",
                "params": {"0": "102"},
                "timestamp": "2008-01-01T10:00:00Z",
                "logid": 2,
            },
            {"action": "autocreate"},
            {"action": "forcecreatelocal"},
            {"action": "create", "actionhidden": True},
        ]
    )
    assert [r["local_id"] for r in result] == [101, 102]
    assert result[0]["name"] == "CreatedAccount"
    assert missing == 1


async def test_page_keeps_cursor_and_uses_inclusive_utc_dates():
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {"query": {"logevents": []}, "continue": {"lecontinue": "next"}}
    result = await NewAccountsProvider(transport).page(
        RegistrationRequest(
            start="2008-01-01", end="2008-01-01", action="byemail", cursor="previous"
        )
    )
    params = transport.get.call_args.args[1]
    assert params["leaction"] == "newusers/byemail"
    assert params["lestart"] == "2007-12-31T23:59:00Z"
    assert params["leend"] == "2008-01-02T00:00:59Z"
    assert params["lecontinue"] == "previous"
    assert result["cursor"] == "next"


@pytest.mark.parametrize("temporary", [True, False])
async def test_temporary_accounts_are_excluded_even_while_active(temporary):
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {
        "query": {"users": [{"name": "TemporaryAccount", "userid": 101, "tempexpired": temporary}]}
    }
    result = await NewAccountsProvider(transport).accounts(
        RegistrationBatch(candidates=[candidate()])
    )
    assert result["accounts"] == []
    assert result["excluded"] == 1


async def test_renamed_target_uses_id_and_retains_log_registration():
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {
        "query": {
            "users": [
                {
                    "name": "RenamedAccount",
                    "userid": 101,
                    "tempexpired": None,
                    "centralids": {"CentralAuth": 501},
                    "registration": "2026-01-13T09:59:59Z",
                }
            ]
        }
    }
    result = await NewAccountsProvider(transport).accounts(
        RegistrationBatch(candidates=[candidate()])
    )
    assert transport.get.call_args.args[1]["ususerids"] == "101"
    account = result["accounts"][0]
    assert account["username"] == "RenamedAccount"
    assert account["signup"]["original_name"] == "RegisteredAccount"
    assert account["registration"] == "2026-01-13T09:59:59Z"


async def test_missing_temporary_status_does_not_silently_accept_account():
    transport = AsyncMock(spec=Transport)
    transport.get.return_value = {
        "query": {"users": [{"name": "RegisteredAccount", "userid": 101}]}
    }
    with pytest.raises(SourceError):
        await NewAccountsProvider(transport).accounts(RegistrationBatch(candidates=[candidate()]))


@pytest.mark.parametrize(
    "start,end",
    [("2005-09-07", "2005-09-08"), ("2026-01-14", "2026-01-13"), ("2099-01-01", "2099-01-02")],
)
def test_unsupported_or_invalid_dates_are_rejected(start, end):
    with pytest.raises(ValidationError):
        RegistrationRequest(start=start, end=end)
