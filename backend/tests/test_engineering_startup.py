"""Configured startup, truthful health and recovery ordering without heavy SDKs."""

import builtins

import pytest
from app.adapters import capability_environment as environment
from app.adapters.engineering_composition import build_engineering_capabilities
from app.adapters.engineering_environment import engineering_status
from app.adapters.runtime_diagnostic import DiagnosticRuntime
from app.api.main import create_app
from app.bootstrap import build_services
from app.domain.project_lifecycle import CreateProject
from app.domain.runs import AgentRun
from app.settings import Settings
from fastapi.testclient import TestClient
from test_engineering_capabilities import clash_request, ids_request  # noqa: F401


def options(tmp_path, **kwargs):
    return Settings(data_dir=tmp_path, diagnostic_runtime=True, seed_demo=False, **kwargs)


@pytest.mark.parametrize("profile", ["local", "desktop"])
def test_local_and_desktop_engine_defaults_stay_disabled(tmp_path, profile):
    settings = Settings(data_dir=tmp_path, profile=profile)
    assert not settings.ifc_clash_enabled and not settings.ids_validation_enabled
    assert build_engineering_capabilities(settings) == ()


@pytest.mark.parametrize(
    ("clash", "ids", "names"),
    [
        (False, False, set()),
        (True, False, {"ifc-clash"}),
        (False, True, {"ifc-ids"}),
        (True, True, {"ifc-clash", "ifc-ids"}),
    ],
)
def test_normal_app_startup_registers_selected_providers_lazily(
    tmp_path, monkeypatch, clash, ids, names
):
    original_import = builtins.__import__
    imports = []

    def blocked(name, *args, **kwargs):
        if name.split(".")[0] in {"ifcopenshell", "ifcclash", "ifctester", "xmlschema"}:
            imports.append(name)
            raise ImportError("optional SDK intentionally unavailable")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    monkeypatch.setattr(environment, "dependency", lambda _: False)
    settings = options(tmp_path, ifc_clash_enabled=clash, ids_validation_enabled=ids)
    with TestClient(create_app(settings)) as client:
        assert set(client.app.state.services.rechecks.capabilities) == names
        response = client.get(
            "/api/capabilities?probe=true",
            headers={"Authorization": "Bearer " + settings.api_token},
        )
        assert response.status_code == 200
        rows = {row["name"]: row for row in response.json()["capabilities"]}
        for name, enabled in (("IFC clash", clash), ("IDS validation", ids)):
            assert rows[name]["enabled"] is enabled
            assert rows[name]["status"] == "unavailable_dependency"
            assert rows[name]["service_reachable"] is None
    assert imports == []


def test_configuration_switches_are_read_from_environment(tmp_path, monkeypatch):
    monkeypatch.setenv("CCA_IFC_CLASH_ENABLED", "true")
    monkeypatch.setenv("CCA_IDS_VALIDATION_ENABLED", "true")
    assert {c.name for c in build_engineering_capabilities(options(tmp_path))} == {
        "ifc-clash",
        "ifc-ids",
    }


@pytest.mark.parametrize("empty", [False, True])
def test_explicit_provider_injection_overrides_configured_selection(tmp_path, empty):
    class CustomProvider:
        name = "ifc-clash"
        version = "custom-v1"

        def check(self, request):
            raise AssertionError("startup must not execute a check")

    provider = CustomProvider()
    supplied = () if empty else (provider,)
    svc = build_services(
        options(tmp_path, ifc_clash_enabled=True, ids_validation_enabled=True),
        engineering_capabilities=supplied,
    )
    try:
        assert tuple(svc.rechecks.capabilities.values()) == supplied
    finally:
        svc.close()


def test_registration_precedes_runtime_construction_and_queued_recovery(
    tmp_path, monkeypatch, admin
):
    settings = options(tmp_path, ifc_clash_enabled=True, ids_validation_enabled=True)
    svc = build_services(settings)
    try:
        project = svc.projects.create(CreateProject(name="Recovery ordering"), admin)
        with svc.factory.open(write=True) as repo:
            repo.save_run(AgentRun(id="queued-start", project_id=project.id))
            repo.save_run(AgentRun(id="queued-resume", project_id=project.id, generation=1))
    finally:
        svc.close()
    observed = []
    original = DiagnosticRuntime.__init__

    def assert_registered(coordinator):
        registry = coordinator.inner.rechecks.capabilities
        assert set(registry) == {"ifc-clash", "ifc-ids"}

    def initialized(runtime, coordinator):
        assert_registered(coordinator)
        original(runtime, coordinator)
        observed.append("initialized")

    def recovered(runtime, identity):
        assert_registered(runtime.coordinator)
        observed.append(identity)

    monkeypatch.setattr(DiagnosticRuntime, "__init__", initialized)
    monkeypatch.setattr(DiagnosticRuntime, "start", recovered)
    monkeypatch.setattr(DiagnosticRuntime, "resume", recovered)
    svc = build_services(settings)
    try:
        assert observed[0] == "initialized"
        assert set(observed[1:]) == {"queued-start", "queued-resume"}
    finally:
        svc.close()


@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_enabled_missing_sdk_check_returns_review_not_success(kind, tmp_path, monkeypatch, request):
    original_import = builtins.__import__

    def missing(name, *args, **kwargs):
        if name.split(".")[0] in {"ifcopenshell", "ifcclash", "ifctester", "xmlschema"}:
            raise ImportError("optional SDK unavailable")
        return original_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", missing)
    svc = build_services(options(tmp_path, ifc_clash_enabled=True, ids_validation_enabled=True))
    try:
        name = "ifc-clash" if kind == "clash" else "ifc-ids"
        check = request.getfixturevalue("clash_request" if kind == "clash" else "ids_request")
        result = svc.rechecks.capabilities[name].check(check)
        assert result.outcome == "NEEDS_REVIEW" and not result.evidence
        assert result.expected_condition_satisfied is not True
        assert "Install the BIM extra" in result.explanation
    finally:
        svc.close()


@pytest.mark.parametrize("kind", ["clash", "ids"])
@pytest.mark.parametrize("state", ["disabled", "registered", "unregistered", "injected"])
def test_capability_health_uses_registry_and_keeps_sdk_health_unprobed(
    kind, state, tmp_path, monkeypatch
):
    monkeypatch.setattr(environment, "dependency", lambda _: True)
    name = "ifc-clash" if kind == "clash" else "ifc-ids"
    configured = state in {"registered", "unregistered"}
    settings = options(
        tmp_path,
        **{("ifc_clash_enabled" if kind == "clash" else "ids_validation_enabled"): configured},
    )
    providers = build_engineering_capabilities(
        options(tmp_path, ifc_clash_enabled=True, ids_validation_enabled=True)
    )
    provider = next(provider for provider in providers if provider.name == name)
    registry = {name: provider} if state in {"registered", "injected"} else {}
    row = engineering_status(settings, registry)[0 if kind == "clash" else 1]
    assert row.enabled is bool(registry)
    assert row.dependency_available
    assert row.service_reachable is None
    assert (
        row.status
        == {
            "disabled": "available_disabled",
            "registered": "enabled",
            "unregistered": "unhealthy",
            "injected": "enabled",
        }[state]
    )
    if registry:
        assert row.version == provider.version and "not a live SDK probe" in row.reason


@pytest.mark.parametrize("missing", ["ifcclash", "ifcopenshell", "ifctester", "xmlschema"])
def test_all_required_engine_dependencies_are_reported(tmp_path, monkeypatch, missing):
    monkeypatch.setattr(environment, "dependency", lambda module: module != missing)
    settings = options(tmp_path, ifc_clash_enabled=True, ids_validation_enabled=True)
    registry = {provider.name: provider for provider in build_engineering_capabilities(settings)}
    rows = engineering_status(settings, registry)
    affected = rows if missing == "ifcopenshell" else (rows[0 if missing == "ifcclash" else 1],)
    for row in affected:
        assert row.enabled and not row.dependency_available
        assert row.status == "unavailable_dependency"
        assert missing in row.reason and row.service_reachable is None
