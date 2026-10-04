"""Explicit project selection, with verified originals and transactional ReCheck outbox."""

from pathlib import PurePath

from app.application.projects import record_lifecycle_change
from app.domain.engineering import IDSRequirementsRequest, IDSRequirementsSelection
from app.domain.errors import Conflict
from app.policies.actions import require


class IDSRequirementsService:
    def __init__(self, factory, sources, rechecks):
        self.factory, self.sources, self.rechecks = factory, sources, rechecks

    def get(self, project_id, principal):
        require(principal, "read")
        with self.factory.open() as repo:
            repo.state(project_id)
            return repo.ids_requirements(project_id)

    def select(self, project_id, request: IDSRequirementsRequest, principal):
        require(principal, "ingest")
        # File I/O and hashing never hold the project write transaction.
        revision, _ = self.sources.content(
            project_id, request.source_id, request.revision_id, principal
        )
        if PurePath(revision.original_filename).suffix.lower() != ".ids":
            raise Conflict("IDS requirements must select an original .ids artifact")
        with self.factory.open(project_id, write=True) as repo:
            state = repo.state(project_id)
            source = repo.project_source(project_id, request.source_id)
            if source.kind != "DOCUMENT":
                raise Conflict("IDS requirements must belong to a document source")
            previous = repo.ids_requirements(project_id)
            if previous and (previous.source_id, previous.revision_id) == (
                request.source_id,
                request.revision_id,
            ):
                selected = previous
            else:
                selected = IDSRequirementsSelection(
                    project_id=project_id, sha256=revision.sha256, **request.model_dump()
                )
                repo.save_ids_requirements(selected)
                record_lifecycle_change(
                    repo,
                    state,
                    principal,
                    "IDS_REQUIREMENTS_SELECTED",
                    {
                        "source_id": selected.source_id,
                        "revision_id": selected.revision_id,
                    },
                )
                for finding in repo.ids_findings(project_id):
                    for source_id in {
                        d.source_id for d in finding.dependencies if d.requirements_kind == "ids"
                    }:
                        model = repo.latest_source_revision(project_id, source_id)
                        if model:
                            self.rechecks.record_revision(
                                repo,
                                model,
                                principal,
                                finding_id=finding.id,
                                request_id="ids:" + selected.id,
                                ids_only=True,
                            )
        # Repeating selection also drains a committed outbox after dispatch failure.
        self.rechecks.dispatch(project_id)
        return selected
