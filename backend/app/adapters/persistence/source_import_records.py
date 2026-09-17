from sqlalchemy import ForeignKey, ForeignKeyConstraint, String
from sqlalchemy.orm import Mapped, mapped_column

from app.adapters.persistence.record_session import SessionRecords
from app.adapters.persistence.tables import Base
from app.domain.source_imports import SourceImportLink


class SourceImportRow(Base):
    __tablename__ = "source_imports"
    revision_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[str] = mapped_column(String(100))
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), unique=True)
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "source_id", "revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
    )


class SourceImportRecords(SessionRecords):
    def source_import(self, revision_id: str) -> SourceImportLink | None:
        row = self.session.get(SourceImportRow, revision_id)
        return (
            SourceImportLink(
                project_id=row.project_id,
                source_id=row.source_id,
                revision_id=row.revision_id,
                run_id=row.run_id,
            )
            if row
            else None
        )

    def save_source_import(self, link: SourceImportLink) -> None:
        self.session.add(SourceImportRow(**link.model_dump()))
        self.session.flush()
