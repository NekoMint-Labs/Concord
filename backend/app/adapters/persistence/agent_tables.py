from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.adapters.persistence.tables import Base


class AgentSettingsRow(Base):
    __tablename__ = "project_agent_settings"
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)


class InvestigationRow(Base):
    __tablename__ = "investigations"
    run_id: Mapped[str] = mapped_column(ForeignKey("agent_runs.id"), primary_key=True)
    payload: Mapped[dict] = mapped_column(JSON)
    report: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class AgentNoticeRow(Base):
    __tablename__ = "agent_notices"
    id: Mapped[str] = mapped_column(ForeignKey("project_source_revisions.id"), primary_key=True)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    created_at: Mapped[str] = mapped_column(String(40))
    payload: Mapped[dict] = mapped_column(JSON)
