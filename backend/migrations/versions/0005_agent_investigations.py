"""Project initiative policy, durable investigation requests and revision notices."""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "project_agent_settings",
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_table(
        "investigations",
        sa.Column("run_id", sa.String(100), sa.ForeignKey("agent_runs.id"), primary_key=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("report", sa.JSON(), nullable=True),
    )
    op.create_table(
        "agent_notices",
        sa.Column(
            "id", sa.String(100), sa.ForeignKey("project_source_revisions.id"), primary_key=True
        ),
        sa.Column("project_id", sa.String(100), sa.ForeignKey("projects.id"), nullable=False),
        sa.Column("created_at", sa.String(40), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
    )
    op.create_index("ix_agent_notices_project_id", "agent_notices", ["project_id"])


def downgrade():
    op.drop_table("agent_notices")
    op.drop_table("investigations")
    op.drop_table("project_agent_settings")
