"""Shared-session persistence for engineering coordination."""

from sqlalchemy import select

from app.adapters.persistence.engineering_tables import (
    ChangeRow,
    CoordinationRow,
    DependencyRow,
    FindingRow,
    IDSRequirementsRow,
    PublicationRow,
    ReCheckRow,
)
from app.adapters.persistence.record_session import SessionRecords
from app.domain.engineering import Change, Coordination, IDSRequirementsSelection, ReCheck
from app.domain.errors import NotFound
from app.domain.models import Finding


class EngineeringRecords(SessionRecords):
    def ids_requirements(self, project_id: str) -> IDSRequirementsSelection | None:
        row = self.session.get(IDSRequirementsRow, project_id)
        return IDSRequirementsSelection.model_validate(row.payload) if row else None

    def save_ids_requirements(self, item: IDSRequirementsSelection) -> None:
        self.session.merge(
            IDSRequirementsRow(
                project_id=item.project_id,
                source_id=item.source_id,
                revision_id=item.revision_id,
                payload=item.model_dump(mode="json"),
            )
        )
        self.session.flush()

    def ids_findings(self, project_id: str) -> list[Finding]:
        identities = select(DependencyRow.finding_id).where(
            DependencyRow.project_id == project_id, DependencyRow.uses_ids_requirements.is_(True)
        )
        rows = self.session.scalars(
            select(FindingRow).where(
                FindingRow.project_id == project_id,
                FindingRow.state == "CONFIRMED",
                FindingRow.id.in_(identities),
            )
        )
        return [Finding.model_validate(row.payload) for row in rows]

    def add_change(self, item: Change) -> None:
        self.session.add(
            ChangeRow(
                id=item.id,
                project_id=item.project_id,
                source_id=item.source_id,
                to_revision_id=item.to_revision_id,
                payload=item.model_dump(mode="json"),
            )
        )

    def changes(self, project_id: str, revision_id: str | None = None) -> list[Change]:
        query = select(ChangeRow).where(ChangeRow.project_id == project_id)
        if revision_id:
            query = query.where(ChangeRow.to_revision_id == revision_id)
        return [Change.model_validate(r.payload) for r in self.session.scalars(query.limit(1000))]

    def change(self, project_id: str, change_id: str) -> Change:
        row = self.session.get(ChangeRow, change_id)
        if row is None or row.project_id != project_id:
            raise NotFound("Engineering change not found")
        return Change.model_validate(row.payload)

    def save_finding(self, item: Finding, *, new: bool = False) -> None:
        self.session.merge(
            FindingRow(
                id=item.id,
                project_id=item.project_id,
                state=item.state,
                payload=item.model_dump(mode="json"),
            )
        )
        self.session.flush()
        if new:
            for index, dependency in enumerate(item.dependencies):
                self.session.add(
                    DependencyRow(
                        finding_id=item.id,
                        ordinal=str(index),
                        project_id=item.project_id,
                        source_id=dependency.source_id,
                        source_revision_id=dependency.source_revision_id,
                        uses_ids_requirements=dependency.requirements_kind == "ids",
                    )
                )

    def finding(self, project_id: str, finding_id: str) -> Finding:
        row = self.session.get(FindingRow, finding_id)
        if row is None or row.project_id != project_id:
            raise NotFound("Finding not found")
        return Finding.model_validate(row.payload)

    def findings(self, project_id: str) -> list[Finding]:
        query = select(FindingRow).where(FindingRow.project_id == project_id).limit(1000)
        return [Finding.model_validate(r.payload) for r in self.session.scalars(query)]

    def dependent_findings(self, project_id: str, source_id: str) -> list[Finding]:
        matching_ids = select(DependencyRow.finding_id).where(
            DependencyRow.project_id == project_id,
            DependencyRow.source_id == source_id,
        )
        # Membership deduplicates dependencies without comparing JSON payloads,
        # which PostgreSQL's JSON type does not support for SELECT DISTINCT.
        query = select(FindingRow).where(
            FindingRow.project_id == project_id,
            FindingRow.id.in_(matching_ids),
            FindingRow.state == "CONFIRMED",
        )
        return [Finding.model_validate(r.payload) for r in self.session.scalars(query)]

    def add_coordination(self, item: Coordination) -> None:
        self.session.add(
            CoordinationRow(
                id=item.id,
                project_id=item.project_id,
                finding_id=item.finding_id,
                payload=item.model_dump(mode="json"),
            )
        )

    def coordination_records(self, project_id: str, finding_id: str) -> list[Coordination]:
        rows = self.session.scalars(
            select(CoordinationRow)
            .where(
                CoordinationRow.project_id == project_id,
                CoordinationRow.finding_id == finding_id,
            )
            .limit(1000)
        )
        return [Coordination.model_validate(r.payload) for r in rows]

    def save_recheck(self, item: ReCheck) -> None:
        self.session.merge(
            ReCheckRow(
                id=item.id,
                project_id=item.project_id,
                finding_id=item.finding_id,
                source_revision_id=item.source_revision_id,
                finding_updated_at=item.finding_updated_at.isoformat(),
                request_id=item.request_id,
                payload=item.model_dump(mode="json"),
            )
        )

    def recheck(self, project_id: str, identity: str) -> ReCheck:
        row = self.session.get(ReCheckRow, identity)
        if row is None or row.project_id != project_id:
            raise NotFound("ReCheck not found")
        return ReCheck.model_validate(row.payload)

    def rechecks(self, project_id: str, finding_id: str) -> list[ReCheck]:
        rows = self.session.scalars(
            select(ReCheckRow)
            .where(
                ReCheckRow.project_id == project_id,
                ReCheckRow.finding_id == finding_id,
            )
            .limit(1000)
        )
        return [ReCheck.model_validate(r.payload) for r in rows]

    def publication_digest(self, project_id: str, operation_id: str) -> str | None:
        row = self.session.get(PublicationRow, (project_id, operation_id))
        return row.digest if row else None

    def add_publication(self, project_id: str, operation_id: str, digest: str) -> None:
        self.session.add(
            PublicationRow(
                project_id=project_id,
                operation_id=operation_id,
                digest=digest,
            )
        )
