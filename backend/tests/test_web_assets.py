"""Real static responses must not inherit incompatible Windows file associations."""

import mimetypes

import pytest
from app.api.web import mount_web
from fastapi import FastAPI
from fastapi.testclient import TestClient


@pytest.mark.parametrize(
    ("filename", "media_type", "content"),
    [
        ("worker.mjs", "text/javascript", b"export const ready = true;"),
        ("web-ifc.wasm", "application/wasm", b"\x00asm\x01\x00\x00\x00"),
    ],
)
def test_browser_assets_override_host_mime_types(
    tmp_path, monkeypatch, filename, media_type, content
):
    # Reproduce a host association without editing the OS registry.
    mimetypes.init()
    monkeypatch.setitem(mimetypes.types_map, ".mjs", "text/plain")
    monkeypatch.setitem(mimetypes.types_map, ".wasm", "application/octet-stream")
    (tmp_path / filename).write_bytes(content)
    app = FastAPI()
    mount_web(app, tmp_path)
    with TestClient(app) as client:
        response = client.get(f"/{filename}")
        assert response.status_code == 200
        assert response.headers["content-type"].split(";")[0] == media_type
        assert response.content == content
        head = client.head(f"/{filename}")
        assert head.status_code == 200 and head.content == b""
        assert head.headers["content-type"] == response.headers["content-type"]
        cached = client.get(f"/{filename}", headers={"If-None-Match": response.headers["etag"]})
        assert cached.status_code == 304
