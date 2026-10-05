"""Dependency and registry inspection; never imports or executes optional SDKs."""

from collections.abc import Mapping

from app.adapters import capability_environment as environment
from app.domain.runs import Capability
from app.ports.engineering import EngineeringCapability
from app.settings import Settings


def engineering_status(
    settings: Settings, registry: Mapping[str, EngineeringCapability]
) -> tuple[Capability, ...]:
    return (
        _inspect(
            "IFC clash",
            "IfcClash",
            ("ifcclash", "ifcopenshell"),
            settings.ifc_clash_enabled,
            registry.get("ifc-clash"),
        ),
        _inspect(
            "IDS validation",
            "IfcTester",
            ("ifctester", "ifcopenshell", "xmlschema"),
            settings.ids_validation_enabled,
            registry.get("ifc-ids"),
        ),
    )


def _inspect(
    name: str,
    implementation: str,
    modules: tuple[str, ...],
    configured: bool,
    provider: EngineeringCapability | None,
) -> Capability:
    registered = provider is not None
    result = environment.optional(name, implementation, modules[0], registered)
    missing = tuple(module for module in modules if not environment.dependency(module))
    if missing:
        return result.model_copy(
            update={
                "status": "unavailable_dependency",
                "dependency_available": False,
                "reason": "Install the BIM extra; missing dependencies: " + ", ".join(missing),
            }
        )
    if configured and not registered:
        return result.model_copy(
            update={
                "status": "unhealthy",
                "reason": "Configured provider is absent from the ReCheck registry",
            }
        )
    if provider is not None:
        return result.model_copy(
            update={
                "version": provider.version,
                "reason": "Provider registered; dependency presence is not a live SDK probe",
            }
        )
    return result
