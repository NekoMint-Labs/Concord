"""Composition-root selection for optional engineering providers.

Provider objects are lightweight and do not import their optional SDKs. The
composition root decides whether they are registered; adapters perform lazy SDK
loading only when a check actually runs.
"""

from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from app.ports.engineering import EngineeringCapability
from app.settings import Settings


def build_engineering_capabilities(settings: Settings) -> tuple[EngineeringCapability, ...]:
    """Build providers enabled for this launch without probing optional SDKs."""

    capabilities: list[EngineeringCapability] = []
    if settings.ifc_clash_enabled:
        capabilities.append(IfcClashCapability())
    if settings.ids_validation_enabled:
        capabilities.append(IfcTesterCapability())
    return tuple(capabilities)
