"""IfcOpenShell handles IFC syntax and relationship semantics; geometry is not loaded."""

import hashlib
from pathlib import Path

from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError
from app.ports.providers import BIMElement


class IfcOpenShellBIMProvider:
    def __init__(
        self, path: Path | None, max_bytes: int = 100 * 1024 * 1024, max_elements: int = 1000
    ):
        if max_bytes < 1 or max_elements < 1:
            raise ValueError("IFC limits must be positive")
        self.path, self.max_bytes, self.max_elements = path, max_bytes, max_elements
        self._model = None
        self.revision = "unloaded"

    def _load(self) -> None:
        if self._model is not None:
            return
        path, max_bytes = self.path, self.max_bytes
        if path is None or not path.is_file() or path.suffix.lower() != ".ifc":
            raise CapabilityUnavailable("Configure an existing local IFC file with CCA_IFC_PATH")
        if path.stat().st_size > max_bytes:
            raise DomainError("IFC exceeds configured size limit")
        try:
            import ifcopenshell
            import ifcopenshell.util.element
        except ImportError as exc:
            raise CapabilityUnavailable("Install the bim extra for IfcOpenShell") from exc
        self._util = ifcopenshell.util.element
        try:
            with path.open("rb") as source:
                content = source.read(max_bytes + 1)
        except OSError as exc:
            raise ProviderError("Configured IFC source could not be read") from exc
        if len(content) > max_bytes:
            raise DomainError("IFC exceeds configured size limit")
        self.revision = hashlib.sha256(content).hexdigest()
        try:
            # Parse the exact hashed bytes, not a path that might change between reads.
            model = ifcopenshell.file.from_string(content.decode("utf-8-sig"))
            if not model.by_type("IfcProject"):
                raise ValueError("IFC has no project")
            self._model = model
        except (ifcopenshell.Error, RuntimeError, ValueError, UnicodeError) as exc:
            raise ProviderError("IFC is malformed or unsupported") from exc

    def elements(
        self, *, element_id: str | None = None, kind: str | None = None, location: str | None = None
    ) -> list[BIMElement]:
        self._load()
        model = self._model
        assert model is not None
        try:
            if element_id:
                try:
                    rows = [model.by_guid(element_id)]
                except RuntimeError:
                    return []
            else:
                rows = model.by_type(kind or "IfcElement")
        except RuntimeError as exc:
            raise DomainError("Unknown IFC entity type") from exc
        result = []
        for element in rows:
            if not element or not element.is_a("IfcElement"):
                continue
            if kind and not element.is_a(kind):
                continue
            container = self._util.get_container(element)
            storey = self._util.get_container(element, ifc_class="IfcBuildingStorey")
            space = container if container and container.is_a("IfcSpace") else None
            names = {str(getattr(x, "GlobalId", "")) for x in (container, storey, space)}
            names |= {str(getattr(x, "Name", "")) for x in (container, storey, space)}
            if location and location not in names:
                continue
            if len(result) >= self.max_elements:
                raise DomainError(
                    "IFC result exceeds the element limit; use a smaller model or "
                    "narrower filters. No partial index was published"
                )
            related = self._util.get_decomposition(element)
            result.append(
                BIMElement(
                    id=element.GlobalId,
                    name=element.Name or element.is_a(),
                    type=element.is_a(),
                    storey=storey.Name if storey else None,
                    space=space.Name if space else None,
                    properties=self._util.get_psets(element),
                    related_ids=tuple(
                        sorted(x.GlobalId for x in related if getattr(x, "GlobalId", None))
                    ),
                    revision=self.revision,
                    ifc_schema=(
                        str(schema) if (schema := getattr(model, "schema", None)) else None
                    ),
                )
            )
        return result

    def by_property(self, pset: str, name: str, value: object) -> list[BIMElement]:
        return [e for e in self.elements() if e.properties.get(pset, {}).get(name) == value]


class LocalIFCImporter:
    """Parse upload bytes through IfcOpenShell, never by an untrusted filesystem path."""

    def parse(self, content: bytes) -> list[BIMElement]:
        import tempfile

        with tempfile.TemporaryDirectory(prefix="cca-ifc-") as folder:
            path = Path(folder) / "import.ifc"
            path.write_bytes(content)
            return IfcOpenShellBIMProvider(path).elements()
