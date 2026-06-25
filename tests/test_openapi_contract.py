"""OpenAPI contract — critical routes stay documented."""

from fastapi.testclient import TestClient

from tidal_dl_ru.server.app import app

client = TestClient(app)

REQUIRED_PATHS = {
    "/api/search": {"post"},
    "/api/auth/login": {"post"},
    "/api/auth/refresh": {"post"},
    "/api/jobs": {"post"},
    "/api/library": {"get"},
    "/api/playlists": {"get", "post"},
    "/api/stream/{provider}/{track_id}": {"get"},
    "/api/artist/{artist_id}/bio": {"get"},
    "/api/client-errors": {"post"},
    "/healthz": {"get"},
}

REQUIRED_SCHEMAS = {
    "SearchResponse",
    "JobCreate",
    "HTTPValidationError",
}


def test_openapi_json_loads():
    res = client.get("/openapi.json")
    assert res.status_code == 200
    spec = res.json()
    assert spec.get("info", {}).get("title") == "FlacAud API"
    assert spec.get("openapi", "").startswith("3.")


def test_openapi_required_paths_present():
    spec = client.get("/openapi.json").json()
    paths = spec.get("paths", {})
    for path, methods in REQUIRED_PATHS.items():
        assert path in paths, f"missing path {path}"
        documented = {m.lower() for m in paths[path].keys()}
        missing = methods - documented
        assert not missing, f"{path} missing methods {missing}"


def test_openapi_core_schemas_present():
    spec = client.get("/openapi.json").json()
    schemas = spec.get("components", {}).get("schemas", {})
    for name in REQUIRED_SCHEMAS:
        assert name in schemas, f"missing schema {name}"
