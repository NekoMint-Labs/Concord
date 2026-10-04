"""IfcTester adapter for structured IDS violations."""

import hashlib
import tempfile
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

from app.adapters.engineering_cache import ids_cache_key
from app.adapters.engineering_results import IDSValidationResult, IDSViolation
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError


class IfcTesterAdapter:
    def __init__(
        self,
        *,
        max_violations: int = 2000,
        max_bytes: int = 100 * 1024 * 1024,
        max_ids_bytes: int = 5 * 1024 * 1024,
    ):
        if min(max_violations, max_bytes, max_ids_bytes) < 1:
            raise ValueError("IfcTester limits must be positive")
        self.max_violations = max_violations
        self.max_bytes, self.max_ids_bytes = max_bytes, max_ids_bytes

    def validate(
        self,
        ifc_content: bytes,
        ids_content: bytes | str,
        *,
        source_id: str,
        source_revision_id: str,
    ) -> IDSValidationResult:
        xml_content = ids_content.encode() if isinstance(ids_content, str) else ids_content
        if (
            not ifc_content
            or not xml_content
            or len(ifc_content) > self.max_bytes
            or len(xml_content) > self.max_ids_bytes
        ):
            raise DomainError("IfcTester requires IFC and IDS content within its byte limits")
        if not source_id.strip() or not source_revision_id.strip():
            raise DomainError("IfcTester requires source and revision identifiers")
        # Keep validation and provenance bound to the same immutable input.
        ifc_content, xml_content = bytes(ifc_content), bytes(xml_content)
        try:
            import ifcopenshell
            from ifctester import ids
            from xmlschema import XMLResource, XMLSchema
        except ImportError as exc:
            raise CapabilityUnavailable("Install the BIM extra for IfcTester") from exc
        try:
            with tempfile.TemporaryDirectory(prefix="cca-ifctester-") as folder:
                ifc_path = Path(folder) / "model.ifc"
                ifc_path.write_bytes(ifc_content)
                model = ifcopenshell.open(str(ifc_path))
                # The SDK's bundled IDS schema is authoritative. Restrict its W3C
                # imports to xmlschema's bundled local fallbacks, and never follow
                # schema hints/entities from an uploaded IDS document.
                schema = XMLSchema(
                    Path(ids.__file__).with_name("ids.xsd"), allow="local", defuse="always"
                )
                document = XMLResource(xml_content, allow="none", defuse="always")
                decoded = schema.decode(
                    document,
                    strip_namespaces=True,
                    namespaces={"": "http://standards.buildingsmart.org/IDS"},
                    use_location_hints=False,
                )
                requirement = ids.Ids().parse(decoded)
                requirement.validate(model, should_filter_version=True, filepath=str(ifc_path))
                violations = []
                for specification in requirement.specifications:
                    if specification.status is False and not specification.failed_entities:
                        violations.append(
                            IDSViolation(
                                specification=specification.name or "Unnamed IDS specification",
                                reason="IDS applicability cardinality requirement failed",
                                source_id=source_id,
                                source_revision_id=source_revision_id,
                                engine="ifctester",
                                engine_version=_version("ifctester"),
                            )
                        )
                    for entity in sorted(specification.failed_entities, key=lambda item: item.id()):
                        reasons = [
                            reason
                            for facet in specification.requirements
                            for failure in facet.failures
                            for failed_entity, reason in [_failure_details(failure)]
                            if failed_entity == entity and reason
                        ]
                        violations.append(
                            IDSViolation(
                                specification=specification.name or "Unnamed IDS specification",
                                global_id=getattr(entity, "GlobalId", None),
                                reason="; ".join(reasons) or "IDS requirement failed",
                                source_id=source_id,
                                source_revision_id=source_revision_id,
                                engine="ifctester",
                                engine_version=_version("ifctester"),
                            )
                        )
                        if len(violations) > self.max_violations:
                            raise DomainError("IDS violation result exceeds the configured limit")
                total = len(requirement.specifications)
                failed = sum(spec.status is False for spec in requirement.specifications)
                skipped = sum(spec.status is None for spec in requirement.specifications)
                if len(violations) > self.max_violations:
                    raise DomainError("IDS violation result exceeds the configured limit")
        except DomainError:
            raise
        except Exception as exc:
            raise ProviderError("IfcTester could not validate the selected IFC revision") from exc
        engine_version = _version("ifctester")
        source_hash = hashlib.sha256(ifc_content).hexdigest()
        requirements_hash = hashlib.sha256(xml_content).hexdigest()
        return IDSValidationResult(
            source_id=source_id,
            source_revision_id=source_revision_id,
            source_hash=source_hash,
            requirements_hash=requirements_hash,
            cache_key=ids_cache_key(
                source_hash=source_hash,
                requirements_hash=requirements_hash,
                engine="ifctester",
                engine_version=engine_version,
            ),
            engine="ifctester",
            engine_version=engine_version,
            specifications=total,
            passed_specifications=total - failed - skipped,
            skipped_specifications=skipped,
            failed_specifications=failed,
            violations=tuple(violations),
        )


def _version(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "unknown"


def _failure_details(failure: object) -> tuple[object | None, str | None]:
    """Normalize IfcTester failure records across its SDK representations."""
    if isinstance(failure, dict):
        element = failure.get("element")
        reason = failure.get("reason")
    else:
        element = getattr(failure, "element", None)
        reason = getattr(failure, "reason", None)
    return element, str(reason) if reason else None
