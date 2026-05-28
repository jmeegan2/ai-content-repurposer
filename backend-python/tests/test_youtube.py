import pytest
from unittest.mock import MagicMock, patch
from google.oauth2.credentials import Credentials
from google.auth.exceptions import RefreshError

from services.youtube import _get_refreshed_credentials, get_youtube_connected

# ISO strings fed into the mock DB row — the function parses these into real datetimes
# and passes them to the real Credentials object, so .expired is evaluated by Google's library.
PAST = "2020-01-01T00:00:00+00:00"    # expired
FUTURE = "2099-01-01T00:00:00+00:00"  # not expired


def _make_supabase(token_expiry=FUTURE):
    """Supabase mock that returns one youtube_tokens row with the given expiry."""
    supabase = MagicMock()
    table = MagicMock()
    table.select.return_value.eq.return_value.execute.return_value.data = [
        {
            "access_token": "access-tok",
            "refresh_token": "refresh-tok",
            "token_expiry": token_expiry,
        }
    ]
    supabase.table.return_value = table
    return supabase, table


def _make_supabase_empty():
    """Supabase mock that returns no rows — user has never connected YouTube."""
    supabase = MagicMock()
    table = MagicMock()
    table.select.return_value.eq.return_value.execute.return_value.data = []
    supabase.table.return_value = table
    return supabase, table


# --- _get_refreshed_credentials ---

@patch("services.youtube.supabase")
def test_no_token_raises(mock_supabase):
    # No row in youtube_tokens → user hasn't connected YouTube → ValueError
    _, table = _make_supabase_empty()
    mock_supabase.table.return_value = table

    with pytest.raises(ValueError, match="not connected"):
        _get_refreshed_credentials("user-1")


@patch("services.youtube.supabase")
def test_valid_token_returned_without_refresh(mock_supabase):
    # Token expiry is in the future → creds.expired is False → Google refresh is never called
    _, table = _make_supabase(token_expiry=FUTURE)
    mock_supabase.table.return_value = table

    with patch.object(Credentials, "refresh") as mock_refresh:
        creds = _get_refreshed_credentials("user-1")

    mock_refresh.assert_not_called()
    assert isinstance(creds, Credentials)
    assert creds.token == "access-tok"


@patch("services.youtube.supabase")
def test_expired_token_refresh_succeeds_updates_supabase(mock_supabase):
    # Token expiry is in the past → creds.expired is True → refresh is called
    # Refresh succeeds → new token saved back to Supabase
    _, table = _make_supabase(token_expiry=PAST)
    mock_supabase.table.return_value = table

    with patch.object(Credentials, "refresh"):
        creds = _get_refreshed_credentials("user-1")

    table.update.assert_called_once()
    assert isinstance(creds, Credentials)


@patch("services.youtube.supabase")
def test_expired_token_refresh_error_deletes_token_and_reraises(mock_supabase):
    # Token is expired and Google returns invalid_grant (revoked/expired refresh token)
    # → token row is deleted from Supabase so next status check returns connected=false
    # → RefreshError is re-raised so the upload lands as "failed"
    _, table = _make_supabase(token_expiry=PAST)
    mock_supabase.table.return_value = table

    with patch.object(Credentials, "refresh", side_effect=RefreshError("invalid_grant")):
        with pytest.raises(RefreshError):
            _get_refreshed_credentials("user-1")

    table.delete.assert_called_once()


@patch("services.youtube.supabase")
def test_expired_token_refresh_error_does_not_update_supabase(mock_supabase):
    # On RefreshError the token is deleted — Supabase update should never be called
    # (guards against accidentally saving a bad token back)
    _, table = _make_supabase(token_expiry=PAST)
    mock_supabase.table.return_value = table

    with patch.object(Credentials, "refresh", side_effect=RefreshError("token_revoked")):
        with pytest.raises(RefreshError):
            _get_refreshed_credentials("user-1")

    table.update.assert_not_called()


# --- get_youtube_connected ---

@patch("services.youtube.supabase")
def test_connected_when_token_exists(mock_supabase):
    # Row exists in youtube_tokens → user has connected YouTube
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = [
        {"user_id": "user-1"}
    ]
    assert get_youtube_connected("user-1") is True


@patch("services.youtube.supabase")
def test_not_connected_when_no_token(mock_supabase):
    # No row in youtube_tokens → user has not connected (or token was deleted after RefreshError)
    mock_supabase.table.return_value.select.return_value.eq.return_value.execute.return_value.data = []
    assert get_youtube_connected("user-1") is False
