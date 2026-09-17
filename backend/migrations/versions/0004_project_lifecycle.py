"""Add source originals and accepted baselines without changing existing project payloads."""

import sqlalchemy as sa
from alembic import op

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_sources",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("project_id", "id"),
    )
    op.create_index("ix_project_sources_project_id", "project_sources", ["project_id"])
    op.create_table(
        "project_source_revisions",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(64), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "source_id"], ["project_sources.project_id", "project_sources.id"]
        ),
        sa.UniqueConstraint("source_id", "sequence"),
        sa.UniqueConstraint("source_id", "sha256"),
        sa.UniqueConstraint("project_id", "source_id", "id"),
    )
    op.create_table(
        "baselines",
        sa.Column("id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.UniqueConstraint("project_id", "id"),
        sa.UniqueConstraint("project_id", "sequence"),
    )
    op.create_table(
        "baseline_entries",
        sa.Column("baseline_id", sa.String(100), primary_key=True),
        sa.Column("source_id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), nullable=False),
        sa.Column("revision_id", sa.String(100), nullable=False),
        sa.ForeignKeyConstraint(
            ["project_id", "baseline_id"], ["baselines.project_id", "baselines.id"]
        ),
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
    op.drop_table("baseline_entries")
    op.drop_table("baselines")
    op.drop_table("project_source_revisions")
    op.drop_index("ix_project_sources_project_id", table_name="project_sources")
    op.drop_table("project_sources")
