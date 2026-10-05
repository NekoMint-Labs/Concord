"""Pinned PDF/CAD engines behind A's trusted execution/publication port.

Construction is cheap. The optional built pack/Node/Chromium is inspected only
when used, and never enabled by ordinary application startup.
"""

import base64
import hashlib
import json
import shutil
from datetime import UTC
from pathlib import Path
from typing import Literal

from pydantic import ValidationError

from app.adapters.comparison_process import MAX_OUTPUT, invoke
from app.domain.engineering import EngineeringPublication
from app.domain.errors import CapabilityUnavailable, Conflict, DomainError, ProviderError
from app.domain.models import Evidence
from app.ports.comparisons import ComparisonExecution

PDF_VERSION = (
    "pdf-diff-viewer@96af1ce5caa0b27b3b4a2e14ef3c16aed0842170/"
    "pdfjs@4.10.38/concord-worker-v2/trusted-v1/playwright@1.63.0/chromium@153.0.8010.12"
)
CAD_VERSION = (
    "mlightcad@250533a861e9fa1feca739b6783286ed4e91674a/"
    "data-model@1.15.1/concord-snapshots-v2/trusted-v1/playwright@1.63.0/chromium@153.0.8010.12"
)


class PinnedComparisonExecutor:
    def __init__(
        self,
        kind: Literal["pdf_comparison", "cad_comparison"],
        frontend_root: Path,
        *,
        node: Path | None = None,
        timeout: float = 150,
    ):
        if kind not in {"pdf_comparison", "cad_comparison"}:
            raise ValueError("Unsupported trusted comparison kind")
        self.kind = kind
        self.name = "pdf-diff-viewer" if kind == "pdf_comparison" else "mlightcad"
        self.version = PDF_VERSION if kind == "pdf_comparison" else CAD_VERSION
        self.frontend_root = frontend_root.resolve()
        self.node = node
        if not 0 < timeout <= 300:
            raise ValueError("Trusted comparison timeout must be within 300 seconds")
        self.timeout = timeout

    def _runtime(self) -> tuple[Path, Path]:
        pack = self.frontend_root / "viewer-integrations" / "trusted"
        runner, manifest = pack / "runner.mjs", pack / "dist" / "manifest.json"
        executable = self.node or shutil.which("node")
        if not executable or not Path(executable).is_file() or not runner.is_file():
            raise CapabilityUnavailable("Trusted comparison Node runtime/runner is unavailable")
        try:
            metadata = json.loads(manifest.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise CapabilityUnavailable("Trusted comparison asset pack is unavailable") from exc
        if (
            not isinstance(metadata, dict)
            or metadata.get("schema") != 1
            or not isinstance(metadata.get("versions"), dict)
            or metadata["versions"].get(self.kind) != self.version
        ):
            raise CapabilityUnavailable("Trusted asset pack does not match pinned engine")
        return Path(executable).resolve(), runner

    def _validate(self, context: ComparisonExecution) -> None:
        bound = context.request
        if (
            bound.kind != self.kind
            or bound.engine != self.name
            or bound.engine_version != self.version
        ):
            raise Conflict("Comparison binding does not match the pinned executor")
        if len(context.originals) != 2:
            raise Conflict("Two ordered verified originals are required")
        for revision, data in zip(bound.revisions, context.originals, strict=True):
            if (
                revision.project_id != context.project_id
                or revision.source_id != bound.source_id
                or not 0 < len(data) <= 32 * 1024 * 1024
                or len(data) != revision.size_bytes
                or hashlib.sha256(data).hexdigest() != revision.sha256
            ):
                raise Conflict("Comparison original failed revision/hash verification")
        if (
            tuple(r.id for r in bound.revisions) != (bound.from_revision_id, bound.to_revision_id)
            or bound.from_revision_id == bound.to_revision_id
            or bound.revisions[0].sequence >= bound.revisions[1].sequence
            or context.snapshot.project_id != context.project_id
            or any(
                not r.original_filename.lower().endswith(
                    ".pdf" if self.kind == "pdf_comparison" else ".dxf"
                )
                for r in bound.revisions
            )
        ):
            raise Conflict("Comparison original revision order is inconsistent")
        # Reject unknown settings before launching the optional engine.
        allowed = {
            "scale",
            "maxShift",
            "colorTolerance",
            "minHighlightArea",
            "cropRegions",
            "maskRegions",
        }
        if self.kind == "cad_comparison":
            allowed = {
                "tolerance",
                "includeUnchanged",
                "compareProps",
                "compareHatch",
                "compareText",
                "compareTolerance",
                "compareRcMargin",
            }
        if set(bound.options) - allowed:
            raise DomainError("Unknown trusted comparison option")

    def execute(self, context: ComparisonExecution) -> bytes:
        self._validate(context)
        node, runner = self._runtime()
        sources = [
            {
                "revisionId": revision.id,
                "sourceHash": revision.sha256,
                "name": revision.original_filename,
                "bytes": base64.b64encode(data).decode("ascii"),
            }
            for revision, data in zip(context.request.revisions, context.originals, strict=True)
        ]
        return invoke(
            node,
            runner,
            {
                "mode": "execute",
                "kind": self.kind,
                "sources": sources,
                "options": context.request.options,
            },
            self.timeout,
        )

    def normalize(
        self, context: ComparisonExecution, raw: bytes, artifact_key: str
    ) -> EngineeringPublication:
        self._validate(context)
        if not raw or len(raw) > MAX_OUTPUT or not artifact_key:
            raise DomainError("Retained comparison artifact and key are required")
        try:
            result = json.loads(raw)
        except (ValueError, UnicodeError) as exc:
            raise ProviderError("Trusted comparison artifact is not JSON") from exc
        node, runner = self._runtime()
        bound = context.request
        identity = {
            "projectId": context.project_id,
            "sourceId": bound.source_id,
            "operationId": context.run_id,
            "before": {
                "revisionId": bound.from_revision_id,
                "sourceHash": bound.revisions[0].sha256,
            },
            "after": {"revisionId": bound.to_revision_id, "sourceHash": bound.revisions[1].sha256},
            "observedAt": context.snapshot.captured_at.astimezone(UTC)
            .isoformat(timespec="milliseconds")
            .replace("+00:00", "Z"),
            "rawArtifactKey": artifact_key,
        }
        output = invoke(
            node,
            runner,
            {
                "mode": "normalize",
                "kind": self.kind,
                "raw": result,
                "options": bound.options,
                "context": identity,
            },
            self.timeout,
        )
        try:
            draft = EngineeringPublication.model_validate_json(output)
        except ValidationError as exc:
            raise ProviderError("Comparison mapper produced invalid canonical drafts") from exc
        revisions = {revision.id: revision for revision in bound.revisions}
        evidence = tuple(
            Evidence(
                snapshot_id=context.snapshot.id,
                provider=self.name,
                source_id=bound.source_id,
                source_revision_id=change.subject.source_revision_id,
                source_revision=revisions[change.subject.source_revision_id].sha256,
                observed_at=context.snapshot.captured_at,
                quality="extracted",
                fact=json.dumps(
                    {
                        "kind": change.kind,
                        "aspects": change.aspects,
                        "engine": self.name,
                        "engine_version": self.version,
                        "raw_artifact_key": artifact_key,
                        "limitations": result["result"]["artifact"]["warnings"]
                        if self.kind == "pdf_comparison"
                        else result["result"]["warnings"],
                        "revisions": [{"id": r.id, "sha256": r.sha256} for r in bound.revisions],
                    },
                    sort_keys=True,
                ),
                viewer_target=change.subject,
            )
            for change in draft.changes
        )
        return draft.model_copy(update={"evidence": evidence})
