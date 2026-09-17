"""Project timezones must work without an operating-system IANA database."""

import zoneinfo

import pytest


@pytest.mark.parametrize("timezone", ["Asia/Shanghai", "America/New_York"])
def test_project_timezone_uses_package_data_without_system_database(client, timezone):
    original_path = zoneinfo.TZPATH
    zoneinfo.reset_tzpath(())
    zoneinfo.ZoneInfo.clear_cache(only_keys=[timezone])
    try:
        response = client.post(
            "/api/projects", json={"name": "Portable timezone", "timezone": timezone}
        )
        assert response.status_code == 201, response.text
        project = response.json()
        assert project["timezone"] == timezone
        persisted = client.get(f"/api/projects/{project['id']}")
        assert persisted.status_code == 200
        assert persisted.json()["project"]["timezone"] == timezone
    finally:
        zoneinfo.reset_tzpath(original_path)
        zoneinfo.ZoneInfo.clear_cache(only_keys=[timezone])
