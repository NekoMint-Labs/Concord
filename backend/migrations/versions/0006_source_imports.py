"""Connect immutable originals to idempotent durable import jobs."""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "source_imports",
        sa.Column("revision_id", sa.String(100), primary_key=True),
        sa.Column("project_id", sa.String(100), nullable=False),
        sa.Column("source_id", sa.String(100), nullable=False),
        sa.Column(
            "run_id", sa.String(100), sa.ForeignKey("agent_runs.id"), nullable=False, unique=True
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
    op.drop_table("source_imports")
