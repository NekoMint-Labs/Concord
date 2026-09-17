from sqlalchemy import delete, select

from app.adapters.persistence.action_records import ActionRecords
from app.adapters.persistence.agent_records import AgentRecords
from app.adapters.persistence.baseline_records import BaselineRecords
from app.adapters.persistence.run_records import RunRecords
from app.adapters.persistence.source_import_records import SourceImportRecords
from app.adapters.persistence.source_records import SourceRecords
from app.adapters.persistence.tables import (
    AnalysisRow,
    BIMIndexRow,
    EventRow,
    EvidenceRow,
    ProjectRow,
    SnapshotRow,
)
from app.domain.events import ProjectEvent
from app.domain.jobs import BIMIndex
from app.domain.models import Analysis, Evidence, ProjectSnapshot, ProjectState
from app.domain.retrieval import PreparedEmbeddingIndex
from app.ports.providers import PreparedDocument


class SQLCoordinationRepository(
    RunRecords, ActionRecords, SourceRecords, BaselineRecords, AgentRecords, SourceImportRecords
):
    """Project facts and evidence plus the unchanged, single-session repository contract."""

    def state(self, project_id: str) -> ProjectState:
        return ProjectState.model_validate(self._required(ProjectRow, project_id).payload)

    def projects(self) -> list[ProjectState]:
        return [
            ProjectState.model_validate(r.payload) for r in self.session.scalars(select(ProjectRow))
        ]

    def save_state(self, state: ProjectState) -> None:
        self.session.merge(
            ProjectRow(
                id=state.project.id, version=state.version, payload=state.model_dump(mode="json")
            )
        )
        self.session.flush()

    def event(self, event_id: str) -> ProjectEvent | None:
        row = self.session.get(EventRow, event_id)
        return ProjectEvent.model_validate(row.payload) if row else None

    def save_event(self, event: ProjectEvent) -> None:
        self.session.add(
            EventRow(
                id=event.id,
                project_id=event.project_id,
                created_at=event.observed_at.isoformat(),
                payload=event.model_dump(mode="json"),
            )
        )

    def events(self, project_id: str) -> list[ProjectEvent]:
        rows = self.session.scalars(
            select(EventRow)
            .where(EventRow.project_id == project_id)
            .order_by(EventRow.created_at.desc())
            .limit(100)
        )
        return [ProjectEvent.model_validate(r.payload) for r in rows]

    def save_snapshot(self, snapshot: ProjectSnapshot) -> None:
        self.session.add(
            SnapshotRow(
                id=snapshot.id,
                project_id=snapshot.project_id,
                payload=snapshot.model_dump(mode="json"),
            )
        )
        self.session.flush()

    def snapshot(self, snapshot_id: str) -> ProjectSnapshot:
        return ProjectSnapshot.model_validate(self._required(SnapshotRow, snapshot_id).payload)

    def save_analysis(self, analysis: Analysis) -> None:
        self.session.add(
            AnalysisRow(
                id=analysis.id,
                project_id=analysis.snapshot.project_id,
                run_id=analysis.run_id,
                created_at=analysis.created_at.isoformat(),
                payload=analysis.model_dump(mode="json"),
            )
        )
        self.session.flush()

    def analysis(self, analysis_id: str) -> Analysis:
        return Analysis.model_validate(self._required(AnalysisRow, analysis_id).payload)

    def latest_analysis(self, project_id: str) -> Analysis | None:
        row = self.session.scalar(
            select(AnalysisRow)
            .where(AnalysisRow.project_id == project_id)
            .order_by(AnalysisRow.created_at.desc())
            .limit(1)
        )
        return Analysis.model_validate(row.payload) if row else None

    def clear_bim_index(self, project_id: str) -> None:
        self.session.execute(delete(BIMIndexRow).where(BIMIndexRow.project_id == project_id))

    def save_bim_index(self, index: BIMIndex) -> None:
        self.session.merge(
            BIMIndexRow(project_id=index.project_id, payload=index.model_dump(mode="json"))
        )

    def bim_index(self, project_id: str) -> BIMIndex | None:
        row = self.session.get(BIMIndexRow, project_id)
        return BIMIndex.model_validate(row.payload) if row else None

    def save_evidence(self, item: Evidence) -> None:
        self.session.add(
            EvidenceRow(
                id=item.id,
                source_id=item.source_id,
                snapshot_id=item.snapshot_id,
                payload=item.model_dump(mode="json"),
            )
        )

    def evidence(self, project_id: str, source_id: str | None = None) -> list[Evidence]:
        query = (
            select(EvidenceRow)
            .join(SnapshotRow, SnapshotRow.id == EvidenceRow.snapshot_id)
            .where(SnapshotRow.project_id == project_id)
        )
        if source_id is not None:
            query = query.where(EvidenceRow.source_id == source_id)
        rows = self.session.scalars(query.limit(1000))
        return [Evidence.model_validate(row.payload) for row in rows]

    def publish_document(self, prepared: PreparedDocument) -> PreparedDocument:
        from app.adapters.persistence.document_records import publish_document

        return publish_document(self.session, prepared)

    def evidence_by_ids(self, project_id: str, identities: tuple[str, ...]) -> list[Evidence]:
        if not identities:
            return []
        rows = self.session.scalars(
            select(EvidenceRow)
            .join(SnapshotRow, SnapshotRow.id == EvidenceRow.snapshot_id)
            .where(SnapshotRow.project_id == project_id, EvidenceRow.id.in_(identities))
        )
        return [Evidence.model_validate(row.payload) for row in rows]

    def publish_embeddings(self, prepared: PreparedEmbeddingIndex) -> dict:
        from app.adapters.persistence.embedding_records import publish_embeddings

        return publish_embeddings(self.session, prepared)
