"""Append-only source originals. Parsing is a separate durable capability responsibility."""

import hashlib

from app.application.projects import record_lifecycle_change
from app.domain.actions import Principal
from app.domain.errors import DomainError
from app.domain.project_sources import (
    CreateProjectSource,
    ProjectSource,
    ProjectSourceRevision,
    ProjectSourceStatus,
    RevisionUploadResult,
)
from app.policies.actions import require
from app.ports.coordination import CoordinationRepository, RepositoryFactory
from app.ports.services import FileStore


def _source_status(
    source: ProjectSource,
    latest_revision_id: str | None,
    accepted_revision_id: str | None,
    baseline_id: str | None,
) -> ProjectSourceStatus:
    return ProjectSourceStatus(
        source=source,
        latest_revision_id=latest_revision_id,
        accepted_revision_id=accepted_revision_id,
        baseline_id=baseline_id,
        has_pending_revision=latest_revision_id is not None
        and latest_revision_id != accepted_revision_id,
    )


def source_status(repo: CoordinationRepository, source: ProjectSource) -> ProjectSourceStatus:
    latest = repo.latest_source_revision(source.project_id, source.id)
    baseline = repo.latest_baseline(source.project_id)
    accepted = (
        next((e.revision_id for e in baseline.entries if e.source_id == source.id), None)
        if baseline
        else None
    )
    return _source_status(
        source, latest.id if latest else None, accepted, baseline.id if baseline else None
    )


def source_statuses(repo: CoordinationRepository, project_id: str) -> list[ProjectSourceStatus]:
    sources = repo.project_sources(project_id)
    if not sources:
        return []
    latest_ids = repo.latest_source_revision_ids(project_id)
    baseline = repo.latest_baseline(project_id)
    accepted_ids = (
        {entry.source_id: entry.revision_id for entry in baseline.entries} if baseline else {}
    )
    baseline_id = baseline.id if baseline else None
    return [
        _source_status(source, latest_ids.get(source.id), accepted_ids.get(source.id), baseline_id)
        for source in sources
    ]


class ProjectSourceService:
    def __init__(self, factory: RepositoryFactory, storage: FileStore, max_upload_bytes: int):
        self.factory, self.storage, self.max_upload_bytes = factory, storage, max_upload_bytes

    def create(
        self, project_id: str, request: CreateProjectSource, principal: Principal
    ) -> ProjectSource:
        require(principal, "ingest")
        source = ProjectSource(project_id=project_id, **request.model_dump())
        with self.factory.open(project_id, write=True) as repo:
            state = repo.state(project_id)
            repo.add_project_source(source)
            record_lifecycle_change(
                repo, state, principal, "PROJECT_SOURCE_CREATED", {"source_id": source.id}
            )
        return source

    def upload(
        self,
        project_id: str,
        source_id: str,
        filename: str,
        content: bytes,
        principal: Principal,
        *,
        media_type: str | None = None,
        external_label: str | None = None,
    ) -> RevisionUploadResult:
        require(principal, "ingest")
        if not content or len(content) > self.max_upload_bytes:
            raise DomainError("Upload must be nonempty and within the configured size limit")
        digest = hashlib.sha256(content).hexdigest()
        # Validate metadata before writing any bytes or returning a duplicate.
        revision = ProjectSourceRevision(
            project_id=project_id,
            source_id=source_id,
            sequence=1,
            original_filename=filename,
            external_label=external_label,
            sha256=digest,
            media_type=media_type,
            size_bytes=len(content),
            storage_key="",
        )
        with self.factory.open() as repo:
            repo.project_source(project_id, source_id)
            duplicate = repo.source_revision_by_hash(project_id, source_id, digest)
        if duplicate:
            return RevisionUploadResult(revision=duplicate, duplicate=True)
        key = f"project-sources/{revision.id}/{digest}"
        revision = revision.model_copy(update={"storage_key": key})
        committed = False
        try:
            # Object I/O stays outside the project transaction. Each attempt owns its key.
            self.storage.put(key, content)
            result = self._publish(revision, principal)
            committed = not result.duplicate
            return result
        finally:
            if not committed:
                self.storage.delete(key)

    def _publish(
        self, revision: ProjectSourceRevision, principal: Principal
    ) -> RevisionUploadResult:
        with self.factory.open(revision.project_id, write=True) as repo:
            state = repo.state(revision.project_id)
            repo.project_source(revision.project_id, revision.source_id)
            duplicate = repo.source_revision_by_hash(
                revision.project_id, revision.source_id, revision.sha256
            )
            if duplicate:
                return RevisionUploadResult(revision=duplicate, duplicate=True)
            latest = repo.latest_source_revision(revision.project_id, revision.source_id)
            revision = revision.model_copy(
                update={"sequence": latest.sequence + 1 if latest else 1}
            )
            repo.add_source_revision(revision)
            record_lifecycle_change(
                repo,
                state,
                principal,
                "SOURCE_REVISION_STORED",
                {
                    "source_id": revision.source_id,
                    "revision_id": revision.id,
                    "sha256": revision.sha256,
                },
            )
        return RevisionUploadResult(revision=revision, duplicate=False)

    def content(
        self, project_id: str, source_id: str, revision_id: str, principal: Principal
    ) -> tuple[ProjectSourceRevision, bytes]:
        require(principal, "read")
        with self.factory.open() as repo:
            revision = repo.source_revision(project_id, source_id, revision_id)
        content = self.storage.read(revision.storage_key)
        if (
            len(content) != revision.size_bytes
            or hashlib.sha256(content).hexdigest() != revision.sha256
        ):
            raise DomainError("Stored source revision failed its integrity check")
        return revision, content
