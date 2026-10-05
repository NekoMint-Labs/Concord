"""Operator-configured fixed comparison pack at the standard startup boundary."""

from importlib import import_module

from app.bootstrap import Services, build_services
from app.domain.errors import CapabilityUnavailable
from app.ports.comparisons import ComparisonExecutor
from app.settings import Settings


def build_comparison_executors(settings: Settings) -> tuple[ComparisonExecutor, ...]:
    kinds = tuple(
        kind
        for kind, enabled in (
            ("pdf_comparison", settings.pdf_comparison_enabled),
            ("cad_comparison", settings.cad_comparison_enabled),
        )
        if enabled
    )
    if not kinds:
        return ()
    # C's adapter is an optional delivery, not a new core dependency or plugin loader.
    try:
        adapter = import_module("app.adapters.trusted_comparisons")
    except ModuleNotFoundError as exc:
        if exc.name != "app.adapters.trusted_comparisons":
            raise
        raise CapabilityUnavailable(
            "Configured PDF/CAD comparisons require the C-owned pinned executor pack"
        ) from exc
    return tuple(
        adapter.PinnedComparisonExecutor(
            kind, settings.comparison_frontend_root, node=settings.comparison_node
        )
        for kind in kinds
    )


def build_configured_services(settings: Settings) -> Services:
    # build_services registers these before constructing the runtime/recovering the outbox.
    return build_services(settings, comparison_executors=build_comparison_executors(settings))
