"""Relational identities for source history and accepted baselines."""

from sqlalchemy import JSON, ForeignKey, ForeignKeyConstraint, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.adapters.persistence.tables import Base


class ProjectSourceRow(Base):
    __tablename__ = "project_sources"
    __table_args__ = (UniqueConstraint("project_id", "id"),)
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class ProjectSourceRevisionRow(Base):
    __tablename__ = "project_source_revisions"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "source_id"], ["project_sources.project_id", "project_sources.id"]
        ),
        UniqueConstraint("source_id", "sequence"),
        UniqueConstraint("source_id", "sha256"),
        UniqueConstraint("project_id", "source_id", "id"),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[str] = mapped_column(String(100))
    sequence: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    payload: Mapped[dict] = mapped_column(JSON)


class BaselineRow(Base):
    __tablename__ = "baselines"
    __table_args__ = (
        UniqueConstraint("project_id", "id"),
        UniqueConstraint("project_id", "sequence"),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    sequence: Mapped[int] = mapped_column(Integer)
    payload: Mapped[dict] = mapped_column(JSON)


class BaselineEntryRow(Base):
    __tablename__ = "baseline_entries"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "baseline_id"], ["baselines.project_id", "baselines.id"]
        ),
        ForeignKeyConstraint(
            ["project_id", "source_id", "revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
    )
    baseline_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100))
    revision_id: Mapped[str] = mapped_column(String(100))
