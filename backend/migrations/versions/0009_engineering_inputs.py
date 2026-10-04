"""Persist explicit IDS version selection and index dependent Findings."""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "finding_dependencies",
        sa.Column("uses_ids_requirements", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_index(
        "ix_dependency_ids", "finding_dependencies", ["project_id", "uses_ids_requirements"]
    )
    op.create_table(
        "engineering_ids_requirements",
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("revision_id", sa.String(100), nullable=False),
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


def downgrade():
    op.drop_table("engineering_ids_requirements")
    op.drop_index("ix_dependency_ids", table_name="finding_dependencies")
    op.drop_column("finding_dependencies", "uses_ids_requirements")
