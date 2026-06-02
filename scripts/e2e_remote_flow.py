"""Live end-to-end API check against a running tidal-dl-ru deployment.

Every step must return HTTP 200 (stream may also return 206 Partial Content).

Environment:
  E2E_BASE_URL   — default http://46.17.102.157
  E2E_USERNAME   — optional; auto-registers a unique user if unset
  E2E_PASSWORD   — default e2e-test-pass-ChangeMe!
  E2E_QUALITY    — stream/download quality (default LOW for speed)
"""

from __future__ import annotations

import os
import sys
import time
import uuid

import httpx

BASE_URL = os.environ.get("E2E_BASE_URL", "http://46.17.102.157").rstrip("/")
E2E_PASSWORD = os.environ.get("E2E_PASSWORD", "e2e-test-pass-ChangeMe!")
E2E_QUALITY = os.environ.get("E2E_QUALITY", "LOW")
JOB_POLL_SEC = float(os.environ.get("E2E_JOB_TIMEOUT", "300"))
JOB_POLL_INTERVAL = 2.0


class FlowError(Exception):
    pass


def _check(label: str, response: httpx.Response, *, allowed: frozenset[int] = frozenset({200})) -> None:
    if response.status_code not in allowed:
        raise FlowError(f"{label}: HTTP {response.status_code} — {response.text[:500]}")


def _auth_headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def ensure_user(client: httpx.Client) -> tuple[str, str]:
    username = os.environ.get("E2E_USERNAME") or f"e2e_{uuid.uuid4().hex[:12]}"
    email = f"{username}@e2e.local"

    reg = client.post(
        "/api/auth/register",
        json={"email": email, "username": username, "password": E2E_PASSWORD},
    )
    if reg.status_code not in (200, 400):
        raise FlowError(f"register: HTTP {reg.status_code} — {reg.text[:300]}")

    login = client.post(
        "/api/auth/login",
        data={"username": username, "password": E2E_PASSWORD},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    _check("login", login)
    token = login.json()["access_token"]
    return username, token


def run(client: httpx.Client | None = None) -> None:
    own_client = client is None
    if own_client:
        client = httpx.Client(base_url=BASE_URL, timeout=120.0)

    try:
        print(f"Target: {BASE_URL}")
        username, token = ensure_user(client)
        print(f"Auth OK ({username})")

        headers = _auth_headers(token)

        print("\n1. Search...")
        r = client.post(
            "/api/search",
            json={"provider": "tidal", "query": "Eminem", "limit": 1},
            headers=headers,
        )
        _check("search", r)
        tracks = r.json().get("tracks", [])
        if not tracks:
            raise FlowError("search: no tracks returned")
        track = tracks[0]
        track_id = track["provider_id"]
        source_url = track.get("source_url") or f"https://tidal.com/track/{track_id}"
        print(f"   Found: {track['title']} ({track_id})")

        print("\n2. Providers...")
        r = client.get("/api/providers", headers=headers)
        _check("providers", r)

        print("\n3. Media token...")
        r = client.get("/api/auth/media-token", headers=headers)
        _check("media-token", r)
        mt = r.json()["token"]

        print("\n4. Stream...")
        r_stream = client.get(
            f"/api/stream/tidal/{track_id}",
            params={"quality": E2E_QUALITY, "mt": mt},
            headers=headers,
            follow_redirects=False,
        )
        _check("stream", r_stream, allowed=frozenset({200, 206}))
        print(f"   Stream OK ({r_stream.headers.get('content-type', '')})")

        print("\n5. Create download job...")
        r_job = client.post(
            "/api/jobs",
            json={"url": source_url, "quality": E2E_QUALITY, "lyrics": False},
            headers={**headers, "Content-Type": "application/json"},
        )
        _check("create job", r_job)
        job_id = r_job.json()["job_id"]
        print(f"   job_id={job_id}")

        print("\n6. Poll job until done...")
        deadline = time.monotonic() + JOB_POLL_SEC
        file_token = None
        while time.monotonic() < deadline:
            r_status = client.get(f"/api/jobs/{job_id}", headers=headers)
            _check("job status", r_status)
            body = r_status.json()
            status = body.get("status")
            tracks_p = body.get("tracks") or []
            if tracks_p:
                t0 = tracks_p[0]
                bw, bt = t0.get("bytes_written", 0), t0.get("bytes_total")
                pct = f"{round(100 * bw / bt)}%" if bt else "?"
                print(f"   status={status} track={t0.get('status')} progress={pct}")
                if t0.get("file_token"):
                    file_token = t0["file_token"]
            else:
                print(f"   status={status}")
            if status == "done" and file_token:
                break
            if status == "failed":
                err = tracks_p[0].get("error") if tracks_p else "unknown"
                raise FlowError(f"job failed: {err}")
            time.sleep(JOB_POLL_INTERVAL)
        else:
            raise FlowError(f"job timed out after {JOB_POLL_SEC}s")

        print("\n7. Download file...")
        r_file = client.get(f"/api/files/{file_token}", params={"mt": mt}, follow_redirects=True)
        _check("file download", r_file, allowed=frozenset({200}))
        size = len(r_file.content)
        if size < 1000:
            raise FlowError(f"file download: suspiciously small ({size} bytes)")
        print(f"   File OK ({size} bytes)")

        print("\nAll steps returned 200 — E2E API flow OK.")
    finally:
        if own_client:
            client.close()


if __name__ == "__main__":
    try:
        run()
    except FlowError as exc:
        print(f"\nFAILED: {exc}", file=sys.stderr)
        sys.exit(1)
    except httpx.HTTPError as exc:
        print(f"\nNETWORK ERROR: {exc}", file=sys.stderr)
        sys.exit(1)
