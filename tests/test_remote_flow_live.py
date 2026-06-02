"""Pytest wrapper for the live remote API flow (skipped unless E2E_RUN_LIVE=1)."""

import os

import pytest

pytestmark = pytest.mark.skipif(
    os.environ.get("E2E_RUN_LIVE") != "1",
    reason="Set E2E_RUN_LIVE=1 to hit a real deployment",
)


def _load_remote_flow_module():
    import importlib.util
    from pathlib import Path

    path = Path(__file__).resolve().parents[1] / "scripts" / "e2e_remote_flow.py"
    spec = importlib.util.spec_from_file_location("test_remote_flow", path)
    mod = importlib.util.module_from_spec(spec)
    assert spec.loader is not None
    spec.loader.exec_module(mod)
    return mod


def test_remote_api_flow():
    _load_remote_flow_module().run()
