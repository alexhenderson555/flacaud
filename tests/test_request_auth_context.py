from jose import jwt

from tidal_dl_ru.database.auth import ALGORITHM, SECRET_KEY, create_access_token, sign_media_token
from tidal_dl_ru.server.request_auth_context import peek_request_actor, sanitize_query


class _Req:
    def __init__(self, *, headers=None, query_params=None):
        self.headers = headers or {}
        self.query_params = query_params or {}


def test_sanitize_query_redacts_secrets():
    q = sanitize_query("q=test&password=secret&mt=abc123")
    assert "secret" not in q
    assert "abc123" not in q
    assert "q=test" in q


def test_peek_request_actor_bearer_username():
    token = create_access_token({"sub": "alice"})
    req = _Req(headers={"authorization": f"Bearer {token}"})
    actor = peek_request_actor(req)
    assert actor["auth"] == "bearer"
    assert actor["username"] == "alice"


def test_peek_request_actor_media_token():
    mt = sign_media_token(42)
    req = _Req(query_params={"mt": mt})
    actor = peek_request_actor(req)
    assert actor["auth"] == "media"
    assert actor["user_id"] == 42


def test_peek_request_actor_guest():
    actor = peek_request_actor(_Req())
    assert actor == {"auth": "guest"}
