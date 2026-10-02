"""Boundaries for host-owned Revit, AutoCAD, and Navisworks connectors.

Concord receives an exported artifact from a host connector and leaves source
revision persistence to the existing ProjectSourceRevision workflow. Native host
objects and vendor SDK types never enter this module.
"""

import hashlib
from pathlib import Path
from typing import Literal

from app.domain.errors import CapabilityUnavailable, DomainError
from app.domain.models import Model

ConnectorHost = Literal["revit", "autocad", "navisworks"]


class ConnectorArtifact(Model):
    host: ConnectorHost
    external_id: str
    filename: str
    media_type: str | None = None
    sha256: str
    size_bytes: int
    source_kind: Literal["BIM", "DRAWING"]
    requires_project_source_revision: Literal[True] = True


class AECConnectorBoundary:
    """Stage exported bytes; this is not a vendor connector or persistence service."""

    _native_extensions = {".rvt", ".dwg", ".nwd", ".nwc"}
    _source_kind: dict[ConnectorHost, Literal["BIM", "DRAWING"]] = {
        "revit": "BIM",
        "autocad": "DRAWING",
        "navisworks": "BIM",
    }

    _export_extensions: dict[ConnectorHost, set[str]] = {
        "revit": {".ifc"},
        "autocad": {".dxf", ".pdf"},
        "navisworks": {".ifc"},
    }

    def stage(
        self,
        content: bytes,
        *,
        host: ConnectorHost,
        external_id: str,
        filename: str,
        media_type: str | None = None,
    ) -> ConnectorArtifact:
        if not content:
            raise DomainError("AEC connector output must be non-empty")
        if not external_id.strip():
            raise DomainError("AEC connector output requires an external identifier")
        if (
            not filename
            or Path(filename).name != filename
            or any(char in filename for char in "/\\:")
            or any(ord(char) < 32 for char in filename)
        ):
            raise DomainError("AEC connector output filename is invalid")
        suffix = Path(filename).suffix.lower()
        if suffix in self._native_extensions:
            raise CapabilityUnavailable(
                f"{host} connector must export an approved artifact before Concord upload"
            )
        if host not in self._source_kind:
            raise DomainError(f"Unsupported AEC connector host: {host}")
        if suffix not in self._export_extensions[host]:
            raise DomainError(f"Unsupported {host} exported artifact format: {suffix}")
        return ConnectorArtifact(
            host=host,
            external_id=external_id,
            filename=filename,
            media_type=media_type,
            sha256=hashlib.sha256(content).hexdigest(),
            size_bytes=len(content),
            source_kind=self._source_kind[host],
        )
