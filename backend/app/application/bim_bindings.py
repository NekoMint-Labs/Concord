"""Human-confirmed Work Package bindings to source-level BIM identities."""

from app.domain.actions import AuditRecord, Principal
from app.domain.bim_revisions import (
    BimBindingStatus,
    ConfirmBimBindings,
    WorkPackageBimBinding,
)
from app.domain.errors import Conflict, DomainError
from app.domain.models import Evidence, ProjectSnapshot, utcnow
from app.policies.actions import require
from app.ports.coordination import RepositoryFactory


class BimBindingService:
    def __init__(self, factory: RepositoryFactory):
        self.factory = factory

    def confirm(
        self,
        project_id: str,
        source_id: str,
        request: ConfirmBimBindings,
        principal: Principal,
    ) -> list[WorkPackageBimBinding]:
        require(principal, "ingest")
        with self.factory.open(project_id, write=True) as repo:
            source = repo.project_source(project_id, source_id)
            if source.kind != "BIM":
                raise Conflict("Bindings require a BIM project source")
            snapshot = repo.bim_revision_snapshot(project_id, source_id, request.revision_id)
            if snapshot is None:
                raise Conflict("Import this source revision before confirming bindings")
            available = {element.global_id for element in snapshot.elements}
            state = repo.state(project_id)
            revision = repo.source_revision(project_id, source_id, request.revision_id)
            requested: list[tuple[str, str]] = []
            for item in request.bindings:
                state.package(item.work_package_id)
                missing = set(item.global_ids) - available
                if missing:
                    raise DomainError(
                        "Binding contains GlobalIds outside the confirmed revision: "
                        + ", ".join(sorted(missing)[:10])
                    )
                requested.extend((item.work_package_id, identity) for identity in item.global_ids)
            requested = list(dict.fromkeys(requested))
            existing = {
                (item.work_package_id, item.global_id): item
                for item in repo.bim_bindings(project_id, source_id)
            }
            pending = [key for key in requested if key not in existing]
            if not pending:
                return [existing[key] for key in requested]

            next_state = state.model_copy(update={"version": state.version + 1})
            evidence_snapshot = ProjectSnapshot(
                project_id=project_id,
                version=next_state.version,
                sources=next_state.sources,
            )
            repo.save_state(next_state)
            repo.save_snapshot(evidence_snapshot)
            created = dict(existing)
            for work_package_id, global_id in pending:
                evidence = Evidence(
                    snapshot_id=evidence_snapshot.id,
                    provider="human-confirmed-bim-binding",
                    source_id=source_id,
                    source_revision=revision.sha256,
                    observed_at=utcnow(),
                    work_package_id=work_package_id,
                    element_ids=(global_id,),
                    fact=(
                        f"{principal.id} confirmed BIM element {global_id} for "
                        f"Work Package {work_package_id}."
                    ),
                )
                repo.save_evidence(evidence)
                binding = repo.add_bim_binding(
                    WorkPackageBimBinding(
                        project_id=project_id,
                        work_package_id=work_package_id,
                        source_id=source_id,
                        global_id=global_id,
                        confirmation_revision_id=request.revision_id,
                        evidence_id=evidence.id,
                        confirmed_by=principal.id,
                    )
                )
                created[(work_package_id, global_id)] = binding
            repo.audit(
                AuditRecord(
                    project_id=project_id,
                    action="BIM_BINDINGS_CONFIRMED",
                    actor=principal.id,
                    snapshot_id=evidence_snapshot.id,
                    detail={
                        "source_id": source_id,
                        "revision_id": request.revision_id,
                        "binding_count": len(pending),
                    },
                )
            )
        return [created[key] for key in requested]

    def statuses(
        self, project_id: str, source_id: str, revision_id: str | None = None
    ) -> list[BimBindingStatus]:
        with self.factory.open() as repo:
            repo.project_source(project_id, source_id)
            if revision_id is None:
                revision = repo.latest_source_revision(project_id, source_id)
                revision_id = revision.id if revision else None
            snapshot = (
                repo.bim_revision_snapshot(project_id, source_id, revision_id)
                if revision_id
                else None
            )
            elements = (
                {element.global_id: element for element in snapshot.elements} if snapshot else {}
            )
            bindings = repo.bim_bindings(project_id, source_id)
        return [
            BimBindingStatus(
                binding=binding,
                revision_id=revision_id,
                element=elements.get(binding.global_id),
                state=(
                    "not_imported"
                    if snapshot is None
                    else "present"
                    if binding.global_id in elements
                    else "missing"
                ),
            )
            for binding in bindings
        ]
