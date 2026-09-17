"""Append-only artifact records; the repository factory owns commit/rollback."""

from sqlalchemy import select

from app.adapters.persistence.lifecycle_tables import ProjectSourceRevisionRow, ProjectSourceRow
from app.adapters.persistence.record_session import SessionRecords
from app.domain.errors import NotFound
from app.domain.project_sources import ProjectSource, ProjectSourceRevision


class SourceRecords(SessionRecords):
    def add_project_source(self, source: ProjectSource) -> None:
        self.session.add(
            ProjectSourceRow(
                id=source.id, project_id=source.project_id, payload=source.model_dump(mode="json")
            )
        )
        self.session.flush()

    def project_source(self, project_id: str, source_id: str) -> ProjectSource:
        row = self._required(ProjectSourceRow, source_id)
        if row.project_id != project_id:
            raise NotFound("Source does not belong to this project")
        return ProjectSource.model_validate(row.payload)

    def project_sources(self, project_id: str) -> list[ProjectSource]:
        rows = self.session.scalars(
            select(ProjectSourceRow)
            .where(ProjectSourceRow.project_id == project_id)
            .order_by(ProjectSourceRow.id)
        )
        return [ProjectSource.model_validate(row.payload) for row in rows]

    def add_source_revision(self, revision: ProjectSourceRevision) -> None:
        self.session.add(
            ProjectSourceRevisionRow(
                id=revision.id,
                project_id=revision.project_id,
                source_id=revision.source_id,
                sequence=revision.sequence,
                sha256=revision.sha256,
                payload=revision.model_dump(mode="json"),
            )
        )
        self.session.flush()

    def source_revision(
        self, project_id: str, source_id: str, revision_id: str
    ) -> ProjectSourceRevision:
        row = self._required(ProjectSourceRevisionRow, revision_id)
        if row.project_id != project_id or row.source_id != source_id:
            raise NotFound("Revision does not belong to this project/source")
        return ProjectSourceRevision.model_validate(row.payload)

    def _revisions(self, project_id: str, source_id: str):
        return select(ProjectSourceRevisionRow).where(
            ProjectSourceRevisionRow.project_id == project_id,
            ProjectSourceRevisionRow.source_id == source_id,
        )

    def source_revisions(self, project_id: str, source_id: str) -> list[ProjectSourceRevision]:
        rows = self.session.scalars(
            self._revisions(project_id, source_id).order_by(ProjectSourceRevisionRow.sequence)
        )
        return [ProjectSourceRevision.model_validate(row.payload) for row in rows]

    def source_revision_by_hash(
        self, project_id: str, source_id: str, digest: str
    ) -> ProjectSourceRevision | None:
        row = self.session.scalar(
            self._revisions(project_id, source_id).where(ProjectSourceRevisionRow.sha256 == digest)
        )
        return ProjectSourceRevision.model_validate(row.payload) if row else None

    def latest_source_revision(
        self, project_id: str, source_id: str
    ) -> ProjectSourceRevision | None:
        row = self.session.scalar(
            self._revisions(project_id, source_id)
            .order_by(ProjectSourceRevisionRow.sequence.desc())
            .limit(1)
        )
        return ProjectSourceRevision.model_validate(row.payload) if row else None
