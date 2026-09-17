"""Source-to-capability bridge; C owns per-revision BIM snapshots and normalized diffs."""

from typing import TYPE_CHECKING

from app.domain.actions import Principal
from app.domain.errors import Conflict
from app.domain.jobs import BIMImport, DocumentImport, JobInput
from app.domain.runs import AgentRun
from app.domain.source_imports import SourceImportLink
from app.policies.actions import require
from app.ports.coordination import CoordinationRepository, RepositoryFactory
from app.ports.services import DurableRuntime

if TYPE_CHECKING:
    from app.application.capability_jobs import CapabilityJobService


def validate_import_source(
    repo: CoordinationRepository, project_id: str, request: JobInput
) -> SourceImportLink | None:
    if not isinstance(request, (BIMImport, DocumentImport)) or not request.source_revision_id:
        return None
    assert request.source_id is not None
    source = repo.project_source(project_id, request.source_id)
    revision = repo.source_revision(project_id, request.source_id, request.source_revision_id)
    if (isinstance(request, BIMImport)) != (source.kind == "BIM"):
        raise Conflict("Import capability must match the project source kind")
    if (request.object_key, request.content_hash, request.filename) != (
        revision.storage_key,
        revision.sha256,
        revision.original_filename,
    ):
        raise Conflict("Import input does not match the immutable source revision")
    return repo.source_import(revision.id)


def link_import(
    repo: CoordinationRepository, project_id: str, request: JobInput, run_id: str
) -> None:
    if isinstance(request, (BIMImport, DocumentImport)) and request.source_revision_id:
        assert request.source_id is not None
        repo.save_source_import(
            SourceImportLink(
                project_id=project_id,
                source_id=request.source_id,
                revision_id=request.source_revision_id,
                run_id=run_id,
            )
        )


class SourceImportService:
    def __init__(
        self, factory: RepositoryFactory, jobs: "CapabilityJobService", runtime: DurableRuntime
    ):
        self.factory, self.jobs, self.runtime = factory, jobs, runtime

    def enqueue(
        self, project_id: str, source_id: str, revision_id: str, principal: Principal
    ) -> AgentRun:
        require(principal, "ingest")
        with self.factory.open() as repo:
            source = repo.project_source(project_id, source_id)
            revision = repo.source_revision(project_id, source_id, revision_id)
        cls = BIMImport if source.kind == "BIM" else DocumentImport
        request = cls(
            source_id=source_id,
            source_revision_id=revision_id,
            filename=revision.original_filename,
            object_key=revision.storage_key,
            content_hash=revision.sha256,
        )
        run = self.jobs.enqueue(project_id, request, principal)
        if run.status == "QUEUED":
            self.runtime.resume(run.id) if run.generation else self.runtime.start(run.id)
        with self.factory.open() as repo:
            return repo.run(run.id)
