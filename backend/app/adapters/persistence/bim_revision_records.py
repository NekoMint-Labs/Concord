"""BIM-specific records; the repository factory owns commit and rollback."""

from sqlalchemy import select

from app.adapters.persistence.bim_revision_tables import (
    BimElementChangeRow,
    BimElementSnapshotRow,
    BimRevisionRow,
    RevisionComparisonRow,
    WorkPackageBimBindingRow,
)
from app.adapters.persistence.record_session import SessionRecords
from app.domain.bim_revisions import (
    BimElementChange,
    BimElementSnapshot,
    BimRevisionSnapshot,
    RevisionComparison,
    WorkPackageBimBinding,
)
from app.domain.errors import NotFound


class BimRevisionRecords(SessionRecords):
    def add_bim_revision_snapshot(self, snapshot: BimRevisionSnapshot) -> None:
        self.session.add(
            BimRevisionRow(
                revision_id=snapshot.revision_id,
                project_id=snapshot.project_id,
                source_id=snapshot.source_id,
                ifc_schema=snapshot.ifc_schema,
                import_seconds=snapshot.import_seconds,
                payload=snapshot.model_dump(mode="json", exclude={"elements"}),
            )
        )
        self.session.flush()
        self.session.add_all(
            BimElementSnapshotRow(
                revision_id=snapshot.revision_id,
                global_id=element.global_id,
                project_id=snapshot.project_id,
                source_id=snapshot.source_id,
                ifc_class=element.ifc_class,
                name=element.name,
                storey=element.storey,
                space=element.space,
                payload=element.model_dump(mode="json"),
            )
            for element in snapshot.elements
        )
        self.session.flush()

    def bim_revision_snapshot(
        self, project_id: str, source_id: str, revision_id: str
    ) -> BimRevisionSnapshot | None:
        row = self.session.get(BimRevisionRow, revision_id)
        if row is None:
            return None
        if row.project_id != project_id or row.source_id != source_id:
            raise NotFound("BIM revision does not belong to this project/source")
        elements = self.bim_revision_elements(project_id, source_id, revision_id)
        return BimRevisionSnapshot.model_validate({**row.payload, "elements": elements})

    def bim_revision_elements(
        self, project_id: str, source_id: str, revision_id: str
    ) -> list[BimElementSnapshot]:
        rows = self.session.scalars(
            select(BimElementSnapshotRow)
            .where(
                BimElementSnapshotRow.project_id == project_id,
                BimElementSnapshotRow.source_id == source_id,
                BimElementSnapshotRow.revision_id == revision_id,
            )
            .order_by(BimElementSnapshotRow.global_id)
        )
        return [BimElementSnapshot.model_validate(row.payload) for row in rows]

    def add_bim_binding(self, binding: WorkPackageBimBinding) -> WorkPackageBimBinding:
        existing = self.session.scalar(
            select(WorkPackageBimBindingRow).where(
                WorkPackageBimBindingRow.project_id == binding.project_id,
                WorkPackageBimBindingRow.work_package_id == binding.work_package_id,
                WorkPackageBimBindingRow.source_id == binding.source_id,
                WorkPackageBimBindingRow.global_id == binding.global_id,
            )
        )
        if existing:
            return WorkPackageBimBinding.model_validate(existing.payload)
        self.session.add(
            WorkPackageBimBindingRow(
                id=binding.id,
                project_id=binding.project_id,
                work_package_id=binding.work_package_id,
                source_id=binding.source_id,
                global_id=binding.global_id,
                payload=binding.model_dump(mode="json"),
            )
        )
        self.session.flush()
        return binding

    def bim_bindings(
        self, project_id: str, source_id: str, global_ids: set[str] | None = None
    ) -> list[WorkPackageBimBinding]:
        query = select(WorkPackageBimBindingRow).where(
            WorkPackageBimBindingRow.project_id == project_id,
            WorkPackageBimBindingRow.source_id == source_id,
        )
        if global_ids is not None:
            if not global_ids:
                return []
            query = query.where(WorkPackageBimBindingRow.global_id.in_(global_ids))
        rows = self.session.scalars(query.order_by(WorkPackageBimBindingRow.id))
        return [WorkPackageBimBinding.model_validate(row.payload) for row in rows]

    def add_revision_comparison(
        self, comparison: RevisionComparison, changes: tuple[BimElementChange, ...]
    ) -> None:
        self.session.add(
            RevisionComparisonRow(
                id=comparison.id,
                project_id=comparison.project_id,
                source_id=comparison.source_id,
                from_revision_id=comparison.from_revision_id,
                to_revision_id=comparison.to_revision_id,
                payload=comparison.model_dump(mode="json"),
            )
        )
        self.session.flush()
        self.session.add_all(
            BimElementChangeRow(
                comparison_id=change.comparison_id,
                global_id=change.global_id,
                change_kind=change.change_kind,
                payload=change.model_dump(mode="json"),
            )
            for change in changes
        )
        self.session.flush()

    def revision_comparison(
        self, project_id: str, source_id: str, comparison_id: str
    ) -> RevisionComparison:
        row = self._required(RevisionComparisonRow, comparison_id)
        if row.project_id != project_id or row.source_id != source_id:
            raise NotFound("Comparison does not belong to this project/source")
        return RevisionComparison.model_validate(row.payload)

    def revision_comparison_for_revisions(
        self,
        project_id: str,
        source_id: str,
        from_revision_id: str,
        to_revision_id: str,
    ) -> RevisionComparison | None:
        row = self.session.scalar(
            select(RevisionComparisonRow).where(
                RevisionComparisonRow.project_id == project_id,
                RevisionComparisonRow.source_id == source_id,
                RevisionComparisonRow.from_revision_id == from_revision_id,
                RevisionComparisonRow.to_revision_id == to_revision_id,
            )
        )
        return RevisionComparison.model_validate(row.payload) if row else None

    def revision_comparisons(self, project_id: str, source_id: str) -> list[RevisionComparison]:
        rows = self.session.scalars(
            select(RevisionComparisonRow)
            .where(
                RevisionComparisonRow.project_id == project_id,
                RevisionComparisonRow.source_id == source_id,
            )
            .order_by(RevisionComparisonRow.id)
        )
        return [RevisionComparison.model_validate(row.payload) for row in rows]

    def bim_element_changes(self, comparison_id: str) -> list[BimElementChange]:
        rows = self.session.scalars(
            select(BimElementChangeRow)
            .where(BimElementChangeRow.comparison_id == comparison_id)
            .order_by(BimElementChangeRow.change_kind, BimElementChangeRow.global_id)
        )
        return [BimElementChange.model_validate(row.payload) for row in rows]
