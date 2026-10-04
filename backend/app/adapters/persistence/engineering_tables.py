"""Indexed coordination state; payloads retain the canonical domain contracts."""

from sqlalchemy import (
    JSON,
    Boolean,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.adapters.persistence.tables import Base


class ChangeRow(Base):
    __tablename__ = "engineering_changes"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "source_id", "to_revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100), index=True)
    source_id: Mapped[str] = mapped_column(String(100))
    to_revision_id: Mapped[str] = mapped_column(String(100), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class FindingRow(Base):
    __tablename__ = "engineering_findings"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    state: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON)


class DependencyRow(Base):
    __tablename__ = "finding_dependencies"
    __table_args__ = (
        Index("ix_dependency_source", "project_id", "source_id"),
        Index("ix_dependency_ids", "project_id", "uses_ids_requirements"),
        ForeignKeyConstraint(
            ["project_id", "source_id", "source_revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
    )
    finding_id: Mapped[str] = mapped_column(ForeignKey("engineering_findings.id"), primary_key=True)
    ordinal: Mapped[str] = mapped_column(String(10), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100))
    source_id: Mapped[str] = mapped_column(String(100))
    source_revision_id: Mapped[str] = mapped_column(String(100))
    uses_ids_requirements: Mapped[bool] = mapped_column(Boolean, default=False)


class IDSRequirementsRow(Base):
    __tablename__ = "engineering_ids_requirements"
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
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    source_id: Mapped[str] = mapped_column(String(100))
    revision_id: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON)


class CoordinationRow(Base):
    __tablename__ = "engineering_coordination"
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("engineering_findings.id"), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class ReCheckRow(Base):
    __tablename__ = "engineering_rechecks"
    __table_args__ = (
        UniqueConstraint("finding_id", "source_revision_id", "finding_updated_at", "request_id"),
    )
    id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    finding_id: Mapped[str] = mapped_column(ForeignKey("engineering_findings.id"), index=True)
    source_revision_id: Mapped[str] = mapped_column(ForeignKey("project_source_revisions.id"))
    finding_updated_at: Mapped[str] = mapped_column(String(40))
    request_id: Mapped[str] = mapped_column(String(160))
    payload: Mapped[dict] = mapped_column(JSON)


class PublicationRow(Base):
    __tablename__ = "engineering_publications"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    operation_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    digest: Mapped[str] = mapped_column(String(64))
