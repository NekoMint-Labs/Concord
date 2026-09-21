"""Add revision-aware BIM snapshots, bindings, comparisons and normalized changes."""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "bim_revisions",
        sa.Column("revision_id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("ifc_schema", sa.String(40)),
        sa.Column("import_seconds", sa.Float(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "source_id", "revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
    )
    op.create_index("ix_bim_revisions_project_id", "bim_revisions", ["project_id"])
    op.create_index("ix_bim_revisions_source_id", "bim_revisions", ["source_id"])
    op.create_table(
        "bim_element_snapshots",
        sa.Column(
            "revision_id",
            sa.String(100),
            sa.ForeignKey("bim_revisions.revision_id"),
            primary_key=True,
        ),
        sa.Column("global_id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("ifc_class", sa.String(100), nullable=False),
        sa.Column("name", sa.String(500)),
        sa.Column("storey", sa.String(500)),
        sa.Column("space", sa.String(500)),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    for name in ("project_id", "source_id", "ifc_class", "name", "storey", "space"):
        op.create_index(f"ix_bim_element_snapshots_{name}", "bim_element_snapshots", [name])
    op.create_table(
        "work_package_bim_bindings",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("work_package_id", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("global_id", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "source_id"], ["project_sources.project_id", "project_sources.id"]
        ),
        sa.UniqueConstraint("project_id", "work_package_id", "source_id", "global_id"),
    )
    for name in ("project_id", "work_package_id", "source_id", "global_id"):
        op.create_index(f"ix_work_package_bim_bindings_{name}", "work_package_bim_bindings", [name])
    op.create_table(
        "revision_comparisons",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("from_revision_id", sa.String(100), nullable=False),
        sa.Column("to_revision_id", sa.String(100), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "source_id", "from_revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "source_id", "to_revision_id"],
            [
                "project_source_revisions.project_id",
                "project_source_revisions.source_id",
                "project_source_revisions.id",
            ],
        ),
        sa.UniqueConstraint("source_id", "from_revision_id", "to_revision_id"),
    )
    op.create_index("ix_revision_comparisons_project_id", "revision_comparisons", ["project_id"])
    op.create_index("ix_revision_comparisons_source_id", "revision_comparisons", ["source_id"])
    op.create_table(
        "bim_element_changes",
        sa.Column(
            "comparison_id",
            sa.String(100),
            sa.ForeignKey("revision_comparisons.id"),
            primary_key=True,
        ),
        sa.Column("global_id", sa.String(100), primary_key=True),
        sa.Column("change_kind", sa.String(20), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_bim_element_changes_change_kind", "bim_element_changes", ["change_kind"])


def downgrade():
    op.drop_table("bim_element_changes")
    op.drop_table("revision_comparisons")
    op.drop_table("work_package_bim_bindings")
    op.drop_table("bim_element_snapshots")
    op.drop_table("bim_revisions")
