"""Bounded BCF 2.1 transport with one optional SDK lifetime per operation."""

import io
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

from app.adapters.bcf_viewpoints import read_viewpoint, validate_camera, write_viewpoint
from app.adapters.engineering_results import BCFViewpoint
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError


class BCFAdapter:
    def __init__(self, *, max_bytes: int = 25 * 1024 * 1024, max_viewpoints: int = 1000):
        if max_bytes < 1 or max_viewpoints < 1:
            raise ValueError("BCF limits must be positive")
        self.max_bytes, self.max_viewpoints = max_bytes, max_viewpoints

    def export_viewpoint(self, viewpoint: BCFViewpoint) -> bytes:
        if not viewpoint.title.strip():
            raise DomainError("BCF viewpoint title is required")
        validate_camera(viewpoint)
        if viewpoint.snapshot_png and len(viewpoint.snapshot_png) > self.max_bytes:
            raise DomainError("BCF snapshot exceeds the configured byte limit")
        try:
            from bcf.v2.bcfxml import BcfXml
        except ImportError as exc:
            raise CapabilityUnavailable("Install the BIM extra for BCF transport") from exc
        try:
            with tempfile.TemporaryDirectory(prefix="cca-bcf-") as folder:
                path = Path(folder) / "viewpoint.bcfzip"
                document = BcfXml.create_new("Concord")
                try:
                    write_viewpoint(document, viewpoint)
                    document.save(path)
                finally:
                    document.close()
                content = path.read_bytes()
                validate_archive(content, self.max_bytes)
                return content
        except DomainError:
            raise
        except Exception as exc:
            raise ProviderError("BCF viewpoint export failed") from exc

    def import_viewpoints(
        self, content: bytes, *, source_id: str, source_revision_id: str
    ) -> tuple[BCFViewpoint, ...]:
        validate_archive(content, self.max_bytes)
        try:
            from bcf.v2.bcfxml import BcfXml
        except ImportError as exc:
            raise CapabilityUnavailable("Install the BIM extra for BCF transport") from exc
        try:
            with tempfile.TemporaryDirectory(prefix="cca-bcf-") as folder:
                path = Path(folder) / "viewpoints.bcfzip"
                path.write_bytes(content)
                document = BcfXml.load(path)
                if document is None:
                    raise ValueError("BCF document could not be loaded")
                try:
                    if document.version.version_id != "2.1":
                        raise DomainError("Only BCF 2.1 viewpoint transport is supported")
                    result = []
                    for topic in document.topics.values():
                        for handler in topic.viewpoints.values():
                            if len(result) >= self.max_viewpoints:
                                raise DomainError(
                                    "BCF viewpoint count exceeds the configured limit"
                                )
                            value = read_viewpoint(topic, handler, source_id, source_revision_id)
                            validate_camera(value)
                            result.append(value)
                    return tuple(result)
                finally:
                    document.close()
        except DomainError:
            raise
        except Exception as exc:
            raise ProviderError("BCF viewpoint import failed") from exc


def validate_archive(content: bytes, max_bytes: int) -> None:
    if not content or len(content) > max_bytes:
        raise DomainError("BCF content is empty or exceeds the configured byte limit")
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as archive:
            entries = archive.infolist()
            if len(entries) > 5000 or sum(row.file_size for row in entries) > max_bytes:
                raise DomainError("BCF archive exceeds the configured expansion limit")
            seen = set()
            for row in entries:
                name = row.orig_filename
                path = PurePosixPath(name)
                if (
                    not name
                    or name.startswith("/")
                    or "\\" in name
                    or ":" in name
                    or "\x00" in name
                    or ".." in path.parts
                    or name in seen
                    or path.as_posix().rstrip("/") != name.rstrip("/")
                    or row.flag_bits & 1
                ):
                    raise DomainError("BCF archive has unsafe, duplicate or encrypted members")
                seen.add(name)
            if "bcf.version" not in seen:
                raise DomainError("BCF archive has no version manifest")
    except zipfile.BadZipFile as exc:
        raise DomainError("BCF file is not a valid ZIP archive") from exc
