"""Validate provenance before atomically publishing normalized engine output."""

import hashlib

from app.domain.engineering import EngineeringPublication
from app.domain.errors import Conflict
from app.domain.models import Evidence
from app.ports.coordination import CoordinationRepository, RepositoryFactory


def validate_evidence(repo: CoordinationRepository, project_id: str, item: Evidence) -> Evidence:
    if repo.snapshot(item.snapshot_id).project_id != project_id:
        raise Conflict("Evidence snapshot belongs to another project")
    revision_id = item.source_revision_id
    if revision_id is None:
        # Only an exact scoped hash match can upgrade a legacy provenance reference.
        revision = repo.source_revision_by_hash(project_id, item.source_id, item.source_revision)
        if revision is None:
            raise Conflict("Evidence needs an authoritative source revision")
        revision_id = revision.id
    revision = repo.source_revision(project_id, item.source_id, revision_id)
    if item.source_revision != revision.sha256:
        raise Conflict("Evidence hash does not match its source revision")
    if item.viewer_target and item.viewer_target.source_revision_id != revision_id:
        raise Conflict("Evidence viewer target references another revision")
    return item.model_copy(update={"source_revision_id": revision_id})


def publish(repo: CoordinationRepository, project_id: str, request: EngineeringPublication) -> None:
    digest = hashlib.sha256(request.model_dump_json().encode()).hexdigest()
    previous = repo.publication_digest(project_id, request.operation_id)
    if previous:
        if previous != digest:
            raise Conflict("Publication operation already has different content")
        return
    repo.state(project_id)
    for change in request.changes:
        if change.project_id != project_id:
            raise Conflict("Change belongs to another project")
        repo.source_revision(project_id, change.source_id, change.to_revision_id)
        if change.from_revision_id:
            repo.source_revision(project_id, change.source_id, change.from_revision_id)
        if change.subject.source_revision_id not in {
            change.to_revision_id,
            change.from_revision_id,
        }:
            raise Conflict("Change subject must reference one of its compared revisions")
        repo.add_change(change)
    for item in request.evidence:
        repo.save_evidence(validate_evidence(repo, project_id, item))
    repo.add_publication(project_id, request.operation_id, digest)


class EngineeringPublisher:
    """Internal adapter boundary; deliberately not an Agent tool or raw write endpoint."""

    def __init__(self, factory: RepositoryFactory):
        self.factory = factory

    def publish(self, project_id: str, request: EngineeringPublication) -> None:
        with self.factory.open(project_id, write=True) as repo:
            publish(repo, project_id, request)
