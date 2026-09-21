"""Relational identities for revision-aware BIM history and comparisons."""

from sqlalchemy import JSON, Float, ForeignKey, ForeignKeyConstraint, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.adapters.persistence.tables import Base


class BimRevisionRow(Base):
    __tablename__ = "bim_revisions"
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
    revision_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100), index=True)
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    ifc_schema: Mapped[str | None] = mapped_column(String(40), nullable=True)
    import_seconds: Mapped[float] = mapped_column(Float)
    payload: Mapped[dict] = mapped_column(JSON)


class BimElementSnapshotRow(Base):
    __tablename__ = "bim_element_snapshots"
    revision_id: Mapped[str] = mapped_column(
        ForeignKey("bim_revisions.revision_id"), primary_key=True
    )
    global_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100), index=True)
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    ifc_class: Mapped[str] = mapped_column(String(100), index=True)
    name: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    storey: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    space: Mapped[str | None] = mapped_column(String(500), nullable=True, index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class WorkPackageBimBindingRow(Base):
    __tablename__ = "work_package_bim_bindings"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "source_id"], ["project_sources.project_id", "project_sources.id"]
        ),
        UniqueConstraint("project_id", "work_package_id", "source_id", "global_id"),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    work_package_id: Mapped[str] = mapped_column(String(100), index=True)
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    global_id: Mapped[str] = mapped_column(String(100), index=True)
    payload: Mapped[dict] = mapped_column(JSON)


class RevisionComparisonRow(Base):
    __tablename__ = "revision_comparisons"
    __table_args__ = (
        ForeignKeyConstraint(
            ["project_id", "source_id", "from_revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
        ForeignKeyConstraint(
            ["project_id", "source_id", "to_revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
        UniqueConstraint("source_id", "from_revision_id", "to_revision_id"),
    )
    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    project_id: Mapped[str] = mapped_column(String(100), index=True)
    source_id: Mapped[str] = mapped_column(String(100), index=True)
    from_revision_id: Mapped[str] = mapped_column(String(100))
    to_revision_id: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict] = mapped_column(JSON)


class BimElementChangeRow(Base):
    __tablename__ = "bim_element_changes"
    comparison_id: Mapped[str] = mapped_column(
        ForeignKey("revision_comparisons.id"), primary_key=True
    )
    global_id: Mapped[str] = mapped_column(String(100), primary_key=True)
    change_kind: Mapped[str] = mapped_column(String(20), index=True)
    payload: Mapped[dict] = mapped_column(JSON)
