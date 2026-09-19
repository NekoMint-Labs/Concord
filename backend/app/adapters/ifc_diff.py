"""Official IfcDiff adapter with a stable Concord-owned normalized result."""

import json
import tempfile
import time
from importlib import import_module
from pathlib import Path

from app.domain.errors import CapabilityUnavailable, ProviderError
from app.ports.bim_revisions import NormalizedIfcDiff


class OfficialIfcDiffEngine:
    relationships = [
        "geometry",
        "attributes",
        "type",
        "property",
        "container",
        "aggregate",
        "classification",
    ]

    def compare(self, old_content: bytes, new_content: bytes) -> NormalizedIfcDiff:
        try:
            ifcdiff = import_module("ifcdiff")
            ifcopenshell = import_module("ifcopenshell")
        except ImportError as exc:
            raise CapabilityUnavailable(
                "Install the bim extra for official IfcDiff support"
            ) from exc
        provider_errors = (OSError, RuntimeError, ValueError, ifcopenshell.Error)
        started = time.perf_counter()
        try:
            with tempfile.TemporaryDirectory(prefix="cca-ifcdiff-") as folder:
                old_path, new_path = Path(folder) / "old.ifc", Path(folder) / "new.ifc"
                old_path.write_bytes(old_content)
                new_path.write_bytes(new_content)
                old_model = ifcopenshell.open(str(old_path))
                new_model = ifcopenshell.open(str(new_path))
                diff = ifcdiff.IfcDiff(
                    old_model,
                    new_model,
                    relationships=self.relationships,
                    is_shallow=False,
                )
                diff.diff()
                changed = {
                    global_id: tuple(sorted(self._aspect(key) for key in details))
                    for global_id, details in diff.change_register.items()
                }
                raw = {
                    "added": sorted(diff.added_elements),
                    "deleted": sorted(diff.deleted_elements),
                    "changed": json.loads(
                        json.dumps(diff.change_register, default=diff.json_dump_default)
                    ),
                }
        except provider_errors as exc:
            raise ProviderError("IfcDiff could not compare the selected IFC revisions") from exc
        return NormalizedIfcDiff(
            engine="ifcdiff",
            engine_version=getattr(ifcdiff, "__version__", "unknown"),
            added=frozenset(raw["added"]),
            deleted=frozenset(raw["deleted"]),
            changed=changed,
            raw=raw,
            compare_seconds=time.perf_counter() - started,
        )

    @staticmethod
    def _aspect(key: str) -> str:
        return key.removesuffix("_changed").removesuffix("_changes")
