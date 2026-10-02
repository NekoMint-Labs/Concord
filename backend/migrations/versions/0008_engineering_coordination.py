"""Add revision-bound changes, findings, indexed dependencies and durable rechecks.

Legacy JSON evidence/analysis payloads are intentionally preserved verbatim.
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def _id(name="id", target=None, primary=False):
    constraints = [sa.ForeignKey(target)] if target else []
    return sa.Column(name, sa.String(100), *constraints, primary_key=primary, nullable=False)


def _payload():
    return sa.Column("payload", sa.JSON(), nullable=False)


def _revision_fk(column):
    return sa.ForeignKeyConstraint(
        ["project_id", "source_id", column],
        [
            "project_source_revisions.project_id",
            "project_source_revisions.source_id",
            "project_source_revisions.id",
        ],
    )


def upgrade():
    op.create_table(
        "engineering_changes",
        _id(primary=True),
        _id("project_id"),
        _id("source_id"),
        _id("to_revision_id"),
        _payload(),
        _revision_fk("to_revision_id"),
    )
    op.create_table(
        "engineering_findings",
        _id(primary=True),
        _id("project_id", "projects.id"),
        sa.Column("state", sa.String(40), nullable=False),
        _payload(),
    )
    op.create_table(
        "finding_dependencies",
        _id("finding_id", "engineering_findings.id", True),
        sa.Column("ordinal", sa.String(10), primary_key=True),
        _id("project_id"),
        _id("source_id"),
        _id("source_revision_id"),
        _revision_fk("source_revision_id"),
    )
    op.create_index("ix_dependency_source", "finding_dependencies", ["project_id", "source_id"])
    op.create_table(
        "engineering_coordination",
        _id(primary=True),
        _id("project_id", "projects.id"),
        _id("finding_id", "engineering_findings.id"),
        _payload(),
    )
    op.create_table(
        "engineering_rechecks",
        _id(target="agent_runs.id", primary=True),
        _id("project_id", "projects.id"),
        _id("finding_id", "engineering_findings.id"),
        _id("source_revision_id", "project_source_revisions.id"),
        sa.Column("finding_updated_at", sa.String(40), nullable=False),
        sa.Column("request_id", sa.String(160), nullable=False),
        _payload(),
        sa.UniqueConstraint("finding_id", "source_revision_id", "finding_updated_at", "request_id"),
    )
    op.create_table(
        "engineering_publications",
        _id("project_id", "projects.id", True),
        _id("operation_id", primary=True),
        sa.Column("digest", sa.String(64), nullable=False),
    )
    for table, columns in {
        "engineering_changes": ("project_id", "to_revision_id"),
        "engineering_findings": ("project_id",),
        "engineering_coordination": ("project_id", "finding_id"),
        "engineering_rechecks": ("project_id", "finding_id"),
    }.items():
        for column in columns:
            op.create_index(f"ix_{table}_{column}", table, [column])


def downgrade():
    for table in (
        "engineering_publications",
        "engineering_rechecks",
        "engineering_coordination",
        "finding_dependencies",
        "engineering_findings",
        "engineering_changes",
    ):
        op.drop_table(table)
