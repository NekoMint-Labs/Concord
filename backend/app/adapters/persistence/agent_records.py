from sqlalchemy import select

from app.adapters.persistence.agent_tables import (
    AgentNoticeRow,
    AgentSettingsRow,
    InvestigationRow,
)
from app.adapters.persistence.record_session import SessionRecords
from app.domain.agent import (
    AgentNotice,
    AgentSettings,
    InvestigationReport,
    InvestigationRequest,
)


class AgentRecords(SessionRecords):
    def agent_settings(self, project_id: str) -> AgentSettings:
        row = self.session.get(AgentSettingsRow, project_id)
        return AgentSettings.model_validate(row.payload) if row else AgentSettings()

    def save_agent_settings(self, project_id: str, settings: AgentSettings) -> None:
        self.session.merge(
            AgentSettingsRow(project_id=project_id, payload=settings.model_dump(mode="json"))
        )

    def save_investigation(self, request: InvestigationRequest) -> None:
        self.session.add(
            InvestigationRow(run_id=request.run_id, payload=request.model_dump(mode="json"))
        )
        self.session.flush()

    def investigation(self, run_id: str) -> InvestigationRequest:
        return InvestigationRequest.model_validate(self._required(InvestigationRow, run_id).payload)

    def save_investigation_report(self, report: InvestigationReport) -> None:
        self._required(InvestigationRow, report.run_id).report = report.model_dump(mode="json")

    def investigation_report(self, run_id: str) -> InvestigationReport | None:
        report = self._required(InvestigationRow, run_id).report
        return InvestigationReport.model_validate(report) if report else None

    def save_agent_notice(self, notice: AgentNotice) -> None:
        self.session.add(
            AgentNoticeRow(
                id=notice.id,
                project_id=notice.project_id,
                created_at=notice.created_at.isoformat(),
                payload=notice.model_dump(mode="json"),
            )
        )

    def agent_notices(self, project_id: str) -> list[AgentNotice]:
        rows = self.session.scalars(
            select(AgentNoticeRow)
            .where(AgentNoticeRow.project_id == project_id)
            .order_by(AgentNoticeRow.created_at.desc())
            .limit(200)
        )
        return [AgentNotice.model_validate(row.payload) for row in rows]
