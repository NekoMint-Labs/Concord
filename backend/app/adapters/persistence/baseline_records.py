"""Immutable baseline aggregates with relationally checked revision entries."""

from collections import defaultdict
from collections.abc import Sequence

from sqlalchemy import select

from app.adapters.persistence.lifecycle_tables import BaselineEntryRow, BaselineRow
from app.adapters.persistence.record_session import SessionRecords
from app.domain.baselines import Baseline, BaselineEntry
from app.domain.errors import NotFound


class BaselineRecords(SessionRecords):
    def add_baseline(self, baseline: Baseline) -> None:
        self.session.add(
            BaselineRow(
                id=baseline.id,
                project_id=baseline.project_id,
                sequence=baseline.sequence,
                payload=baseline.model_dump(mode="json", exclude={"entries"}),
            )
        )
        self.session.flush()
        self.session.add_all(
            [
                BaselineEntryRow(
                    baseline_id=baseline.id,
                    project_id=baseline.project_id,
                    source_id=entry.source_id,
                    revision_id=entry.revision_id,
                )
                for entry in baseline.entries
            ]
        )
        self.session.flush()

    def _baseline_entries(
        self, project_id: str, baseline_id: str | None = None
    ) -> Sequence[BaselineEntryRow]:
        query = select(BaselineEntryRow).where(BaselineEntryRow.project_id == project_id)
        if baseline_id is not None:
            query = query.where(BaselineEntryRow.baseline_id == baseline_id)
        return self.session.scalars(
            query.order_by(BaselineEntryRow.baseline_id, BaselineEntryRow.source_id)
        ).all()

    @staticmethod
    def _baseline(row: BaselineRow, entries: Sequence[BaselineEntryRow]) -> Baseline:
        return Baseline.model_validate(
            {
                **row.payload,
                "entries": tuple(
                    BaselineEntry(source_id=e.source_id, revision_id=e.revision_id) for e in entries
                ),
            }
        )

    def baseline(self, project_id: str, baseline_id: str) -> Baseline:
        row = self._required(BaselineRow, baseline_id)
        if row.project_id != project_id:
            raise NotFound("Baseline does not belong to this project")
        return self._baseline(row, self._baseline_entries(project_id, row.id))

    def baselines(self, project_id: str) -> list[Baseline]:
        rows = self.session.scalars(
            select(BaselineRow)
            .where(BaselineRow.project_id == project_id)
            .order_by(BaselineRow.sequence)
        ).all()
        if not rows:
            return []
        entries_by_baseline: dict[str, list[BaselineEntryRow]] = defaultdict(list)
        for entry in self._baseline_entries(project_id):
            entries_by_baseline[entry.baseline_id].append(entry)
        return [self._baseline(row, entries_by_baseline[row.id]) for row in rows]

    def latest_baseline(self, project_id: str) -> Baseline | None:
        row = self.session.scalar(
            select(BaselineRow)
            .where(BaselineRow.project_id == project_id)
            .order_by(BaselineRow.sequence.desc())
            .limit(1)
        )
        return self._baseline(row, self._baseline_entries(project_id, row.id)) if row else None
