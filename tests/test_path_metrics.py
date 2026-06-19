from tidal_dl_ru.server.path_metrics import normalize_path


def test_normalize_stream_path():
    assert normalize_path("/api/stream/12345/flac") == "/api/stream/{id}"


def test_normalize_static_path():
    assert normalize_path("/api/search") == "/api/search"


def test_normalize_strips_query():
    assert normalize_path("/api/jobs/abc?foo=1") == "/api/jobs/{id}"
