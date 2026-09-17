import hashlib

import pytest
from app.adapters.storage_local import LocalFileStore
from app.domain.errors import DomainError
from app.settings import Settings


def test_api_auth_and_initial_workspace(client):
    assert client.get("/health").status_code == 200
    assert (
        client.get("/api/projects", headers={"Authorization": "Bearer invalid"}).status_code == 401
    )
    result = client.get("/api/projects/harbor-east/workspace")
    assert result.status_code == 200
    assert all(r["status"] == "READY" for r in result.json()["analysis"]["readiness"])
    assert client.get("/api/capabilities").json()["capabilities"][1]["status"] == "unhealthy"


def test_api_critical_demo(client):
    event = {
        "project_id": "harbor-east",
        "work_package_id": "WP-200",
        "kind": "design_revision",
        "title": "Revision V17",
        "change": {"revision": "V17"},
    }
    result = client.post("/api/projects/harbor-east/events", json=event)
    assert result.status_code == 202, result.text
    run = result.json()
    assert run["status"] == "WAITING_APPROVAL"
    data = client.get("/api/projects/harbor-east/workspace").json()
    proposal = data["proposals"][0]
    assert client.post(f"/api/proposals/{proposal['id']}/execute").status_code == 403
    assert client.post(f"/api/proposals/{proposal['id']}/approve", json={}).status_code == 200
    assert client.post(f"/api/proposals/{proposal['id']}/execute").status_code == 202
    fresh = client.get("/api/projects/harbor-east/workspace").json()
    assert not fresh["stale"] and not fresh["analysis"]["constraints"]
    response = client.get(f"/api/runs/{run['id']}/events")
    assert response.status_code == 200
    assert '"type": "RUN_FINISHED"' in response.text
    assert "data: " in response.text and "id: " in response.text
    assert client.post(f"/api/proposals/{proposal['id']}/execute").json()["queued"] is False


def test_document_import_preserves_hash_page_and_search(client):
    content = b"Duct drawing V17\fPage two contains inspection evidence"
    response = client.post(
        "/api/projects/harbor-east/documents",
        files={"file": ("drawing.txt", content, "text/plain")},
    )
    assert response.status_code == 202, response.text
    assert response.json()["category"] == "document_parse"
    document = client.get(f"/api/jobs/{response.json()['id']}").json()["result"]
    chunks = client.get(f"/api/documents/{document['id']}/chunks").json()
    assert {c["page"] for c in chunks} == {1, 2}
    assert all(c["source_hash"] == hashlib.sha256(content).hexdigest() for c in chunks)
    found = client.get("/api/projects/harbor-east/search", params={"q": "inspection"}).json()
    assert any(c["page"] == 2 and "inspection evidence" in c["text"] for c in found)
    assert client.get(f"/api/documents/{document['id']}/content").content == content


@pytest.mark.parametrize(
    "key", ["../escape", "/tmp/escape", "a/../../b", "a\\b", "a//b", "a/./b", "", ".", "a/.", "./a"]
)
def test_storage_rejects_path_traversal(tmp_path, key):
    store = LocalFileStore(tmp_path)
    with pytest.raises(DomainError):
        store.put(key, b"secret")


def test_storage_bounds_and_roundtrip(tmp_path):
    store = LocalFileStore(tmp_path / "files", 8)
    assert store.put("safe/object", b"abc") == hashlib.sha256(b"abc").hexdigest()
    assert store.read("safe/object") == b"abc"
    store.delete("safe/object")
    store.delete("safe/object")
    with pytest.raises(DomainError):
        store.put("too-large", b"012345678")


def test_storage_rejects_symlink_escape(tmp_path):
    store = LocalFileStore(tmp_path / "files")
    try:
        (tmp_path / "files" / "link").symlink_to(tmp_path, target_is_directory=True)
    except OSError as exc:
        if getattr(exc, "winerror", None) == 1314:
            pytest.skip(
                "Windows account lacks symlink privilege; junction escape is tested separately"
            )
        raise
    with pytest.raises(DomainError):
        store.put("link/outside", b"abc")


def test_storage_rejects_windows_junction_escape(tmp_path):
    winapi = pytest.importorskip("_winapi", reason="NTFS junctions are Windows-specific")
    store = LocalFileStore(tmp_path / "files")
    winapi.CreateJunction(str(tmp_path), str(tmp_path / "files" / "link"))
    try:
        with pytest.raises(DomainError):
            store.put("link/outside", b"abc")
        assert not (tmp_path / "outside").exists()
    finally:
        # Remove only the junction, never recurse into its external target.
        (tmp_path / "files" / "link").rmdir()


def test_server_and_desktop_tokens_fail_safe(tmp_path):
    with pytest.raises(ValueError):
        Settings(profile="server", data_dir=tmp_path)
    desktop = Settings(profile="desktop", data_dir=tmp_path)
    assert len(desktop.api_token) >= 32
    assert all(
        not getattr(desktop, field).startswith("local-demo-")
        for field in (
            "api_token",
            "viewer_token",
            "coordinator_token",
            "approver_token",
            "safety_token",
        )
    )
    with pytest.raises(ValueError):
        Settings(profile="local", host="0.0.0.0", data_dir=tmp_path)
