"""Standard startup selects an operator pack without enabling default detectors."""

from types import SimpleNamespace

import pytest
from app import bootstrap_comparisons as composition
from app.api.main import create_app
from app.domain.errors import CapabilityUnavailable
from app.settings import Settings
from fastapi.testclient import TestClient
from pydantic import ValidationError
from test_trusted_comparisons import FixtureExecutor


def configured(tmp_path, **overrides):
    values = dict(
        data_dir=tmp_path / "data",
        comparison_frontend_root=tmp_path / "operator/frontend",
        diagnostic_runtime=True,
        seed_demo=False,
        _env_file=None,
    )
    return Settings(**(values | overrides))


@pytest.mark.parametrize("profile", ["local", "desktop", "server", "full"])
def test_every_profile_keeps_comparisons_disabled(tmp_path, profile, monkeypatch):
    options = {"profile": profile, "data_dir": tmp_path, "_env_file": None}
    if profile in {"server", "full"}:
        options["database_url"] = "postgresql://example/test"
        for field in (
            "api_token",
            "viewer_token",
            "coordinator_token",
            "approver_token",
            "safety_token",
        ):
            options[field] = field + "x" * 32
    settings = Settings(**options)
    monkeypatch.setattr(composition, "import_module", lambda _: pytest.fail("Optional import"))
    assert composition.build_comparison_executors(settings) == ()


@pytest.mark.parametrize("pdf,cad", [(True, False), (False, True), (True, True)])
def test_switches_select_only_fixed_executors(tmp_path, pdf, cad, monkeypatch):
    settings = configured(tmp_path, pdf_comparison_enabled=pdf, cad_comparison_enabled=cad)
    calls = []

    def constructor(kind, frontend_root, *, node):
        calls.append((kind, frontend_root, node))
        return FixtureExecutor(kind)

    def load(name):
        assert name == "app.adapters.trusted_comparisons"
        return SimpleNamespace(PinnedComparisonExecutor=constructor)

    monkeypatch.setattr(composition, "import_module", load)
    result = composition.build_comparison_executors(settings)
    expected = [
        kind for kind, enabled in [("pdf_comparison", pdf), ("cad_comparison", cad)] if enabled
    ]
    assert [item.kind for item in result] == expected
    assert calls == [(kind, settings.comparison_frontend_root, None) for kind in expected]
    assert all(item.calls == 0 for item in result)


def test_operator_environment_selects_node_and_assets(tmp_path, monkeypatch):
    node = tmp_path / "operator/node"
    monkeypatch.setenv("CCA_PDF_COMPARISON_ENABLED", "true")
    monkeypatch.setenv("CCA_COMPARISON_FRONTEND_ROOT", str(tmp_path / "operator/frontend"))
    monkeypatch.setenv("CCA_COMPARISON_NODE", str(node))
    settings = Settings(data_dir=tmp_path / "data", _env_file=None)
    calls = []
    monkeypatch.setattr(
        composition,
        "import_module",
        lambda _: SimpleNamespace(PinnedComparisonExecutor=lambda *a, **k: calls.append((a, k))),
    )
    composition.build_comparison_executors(settings)
    assert calls == [(("pdf_comparison", settings.comparison_frontend_root), {"node": node})]


@pytest.mark.parametrize(
    "overrides,message",
    [
        ({"comparison_frontend_root": None}, "absolute frontend"),
        ({"comparison_frontend_root": "relative/frontend"}, "absolute frontend"),
        ({"comparison_node": "relative/node"}, "absolute operator"),
        ({"comparison_frontend_root": "DATA"}, "outside application data"),
        ({"comparison_node": "DATA"}, "outside application data"),
    ],
)
def test_enabled_executable_paths_cannot_use_application_data(tmp_path, overrides, message):
    values = {
        key: tmp_path / "data/uploads/pack" if value == "DATA" else value
        for key, value in overrides.items()
    }
    with pytest.raises(ValidationError, match=message):
        configured(tmp_path, pdf_comparison_enabled=True, **values)


def test_missing_c_delivery_is_explicit_and_other_import_failures_propagate(tmp_path, monkeypatch):
    settings = configured(tmp_path, pdf_comparison_enabled=True)

    def missing(name):
        raise ModuleNotFoundError(name=name)

    monkeypatch.setattr(composition, "import_module", missing)
    with pytest.raises(CapabilityUnavailable, match="C-owned pinned"):
        composition.build_comparison_executors(settings)

    def broken(name):
        raise ModuleNotFoundError(name="broken_dependency")

    monkeypatch.setattr(composition, "import_module", broken)
    with pytest.raises(ModuleNotFoundError) as failure:
        composition.build_comparison_executors(settings)
    assert failure.value.name == "broken_dependency"


def test_standard_api_startup_registers_without_executing(tmp_path, monkeypatch):
    settings = configured(tmp_path, pdf_comparison_enabled=True)
    executor = FixtureExecutor()
    monkeypatch.setattr(
        composition,
        "import_module",
        lambda _: SimpleNamespace(PinnedComparisonExecutor=lambda *a, **k: executor),
    )
    with TestClient(create_app(settings)) as client:
        assert client.app.state.services.comparisons.executors == {"pdf_comparison": executor}
        assert executor.calls == 0
    assert executor.calls == 0


def test_service_override_keeps_its_explicit_registry(tmp_path, monkeypatch):
    services = composition.build_configured_services(configured(tmp_path))
    settings = configured(tmp_path, pdf_comparison_enabled=True)
    monkeypatch.setattr(composition, "import_module", lambda _: pytest.fail("Override must win"))
    try:
        with TestClient(create_app(settings, services)) as client:
            assert client.app.state.services is services
            assert services.comparisons.executors == {}
    finally:
        services.close()
