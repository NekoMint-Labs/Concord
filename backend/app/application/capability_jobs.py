"""Explicit capability work executed inside the selected durable runtime's steps.

These are application job records, not a scheduler or workflow engine. DBOS/Temporal
owns dispatch, retries and recovery. File/model/solver work stays outside DB locks.
"""

import hashlib

from app.application.capability_work import prepare_capability_work
from app.application.source_imports import link_import, validate_import_source
from app.application.streaming import custom, emit
from app.domain.actions import AuditRecord, Principal
from app.domain.errors import CapabilityUnavailable, Conflict, PermissionDenied
from app.domain.jobs import (
    BIMImport,
    CapabilityJob,
    DocumentImport,
)
from app.domain.models import Evidence, ProjectSnapshot, SourceRevision, new_id, utcnow
from app.domain.runs import AgentRun
from app.domain.transitions import revise
from app.policies.actions import require
from app.ports.coordination import RepositoryFactory
from app.ports.providers import (
    DocumentCatalog,
    IFCImporter,
    SchedulingOptimizer,
    SemanticRetrieval,
    VisionAnalyzer,
)
from app.ports.services import FileStore


class CapabilityJobService:
    def __init__(
        self,
        factory: RepositoryFactory,
        runtime_name: str,
        storage: FileStore,
        documents: DocumentCatalog,
        ifc: IFCImporter,
        optimizer: SchedulingOptimizer,
        vision: VisionAnalyzer,
        enabled: frozenset[str] = frozenset({"document_parse", "bim_import"}),
        semantic: SemanticRetrieval | None = None,
    ):
        self.factory, self.runtime_name, self.storage = factory, runtime_name, storage
        self.documents, self.ifc, self.optimizer, self.vision = documents, ifc, optimizer, vision
        self.enabled = enabled
        self.semantic = semantic

    def enqueue(self, project_id: str, request, principal: Principal) -> AgentRun:
        require(principal, "ingest")
        if request.kind not in self.enabled:
            raise CapabilityUnavailable(f"Capability {request.kind} is disabled in this profile")
        with self.factory.open(project_id, write=True) as repo:
            repo.state(project_id)
            previous = validate_import_source(repo, project_id, request)
            if previous:
                return repo.run(previous.run_id)
            if isinstance(request, BIMImport):
                active = repo.bim_index(project_id)
                request = request.model_copy(
                    update={
                        "base_revision": active.revision if active else None,
                        "base_revision_bound": True,
                    }
                )
            run = AgentRun(project_id=project_id, runtime=self.runtime_name, category=request.kind)
            repo.save_run(run)
            repo.save_job(
                CapabilityJob(
                    id=run.id, project_id=project_id, requested_by=principal.id, request=request
                )
            )
            link_import(repo, project_id, request, run.id)
            emit(repo, run.id, "RUN_STARTED")
            repo.audit(
                AuditRecord(
                    project_id=project_id,
                    action="CAPABILITY_REQUESTED",
                    actor=principal.id,
                    run_id=run.id,
                    detail={"capability": request.kind},
                )
            )
        return run

    def upload(
        self, project_id: str, filename: str, content: bytes, kind: str, principal: Principal
    ) -> AgentRun:
        from pathlib import PurePath

        require(principal, "ingest")
        if (
            not filename
            or PurePath(filename).name != filename
            or "\\" in filename
            or len(filename) > 180
        ):
            raise PermissionDenied("Invalid import filename")
        digest = hashlib.sha256(content).hexdigest()
        key = f"imports/{new_id()}/{digest}"
        self.storage.put(key, content)
        if kind not in {"document_parse", "bim_import"}:
            self.storage.delete(key)
            raise Conflict("Unsupported upload capability")
        cls = DocumentImport if kind == "document_parse" else BIMImport
        request = cls(filename=filename, object_key=key, content_hash=digest)
        try:
            return self.enqueue(project_id, request, principal)
        except Exception:
            self.storage.delete(key)
            raise

    def process(self, run_id: str, *, generation: int | None = None) -> str:
        with self.factory.open() as repo:
            job = repo.job(run_id)
        with self.factory.open(job.project_id, write=True) as repo:
            run = repo.run(run_id)
            job = repo.job(run_id)
            if run.status in {"CANCELLED", "EXPIRED"} or (
                generation is not None and run.generation != generation
            ):
                return run.status
            if job.result is not None:
                repo.save_run(
                    run.model_copy(
                        update={"status": "COMPLETED", "error": None, "updated_at": utcnow()}
                    )
                )
                return "COMPLETED"
            if isinstance(job.request, BIMImport):
                active = repo.bim_index(job.project_id)
                revision = active.revision if active else None
                if not job.request.base_revision_bound:
                    # Migrate only legacy queued job metadata; persist this binding
                    # before SDK work so an automatic retry cannot silently rebind.
                    job = job.model_copy(
                        update={
                            "request": job.request.model_copy(
                                update={"base_revision": revision, "base_revision_bound": True}
                            )
                        }
                    )
                elif job.request.base_revision != revision:
                    raise Conflict(
                        "The active IFC changed after this import was submitted; "
                        "re-upload to confirm replacement"
                    )
            generation = run.generation
            state = repo.state(job.project_id)
            sources = state.sources
            if isinstance(job.request, (DocumentImport, BIMImport)):
                sources += (
                    SourceRevision(source=f"import/{job.id}", revision=job.request.content_hash),
                )
            snapshot = ProjectSnapshot(
                project_id=job.project_id, version=state.version, sources=sources
            )
            repo.save_snapshot(snapshot)
            repo.save_job(job.model_copy(update={"snapshot_id": snapshot.id}))
            repo.save_run(run.model_copy(update={"status": "RUNNING", "updated_at": utcnow()}))
            emit(repo, run_id, "STEP_STARTED", stepName=job.request.kind)
            custom(
                repo,
                run_id,
                "snapshot-captured",
                {"snapshot_id": snapshot.id, "version": snapshot.version},
            )
        prepared = prepare_capability_work(
            job,
            snapshot,
            storage=self.storage,
            documents=self.documents,
            ifc=self.ifc,
            optimizer=self.optimizer,
            vision=self.vision,
            semantic=self.semantic,
        )
        result, evidence = prepared.result, prepared.evidence
        bim_index = prepared.bim_index
        bim_revision = prepared.bim_revision
        prepared_document, prepared_embeddings = prepared.document, prepared.embeddings
        with self.factory.open(job.project_id, write=True) as repo:
            current = repo.run(run_id)
            if current.status in {"CANCELLED", "EXPIRED"} or current.generation != generation:
                return current.status
            if repo.job(run_id).result is not None:
                return "COMPLETED"  # A concurrent durable retry already published the result.
            if prepared_document is not None:
                if not isinstance(job.request, DocumentImport):
                    raise Conflict("Document output does not match the requested capability")
                # Metadata, FTS, evidence and completion commit together. Parsing
                # and object staging happen above, outside the project write lock.
                published = repo.publish_document(prepared_document)
                result = published.metadata.model_dump(mode="json")
                current_state = repo.state(job.project_id)
                repo.save_state(revise(current_state, current_state.work_packages, set()))
                for chunk in published.chunks:
                    evidence.append(
                        Evidence(
                            snapshot_id=snapshot.id,
                            provider=chunk.parser,
                            source_id=job.request.source_id or published.metadata.id,
                            source_revision=chunk.source_hash,
                            observed_at=utcnow(),
                            work_package_id=None,
                            page=chunk.page,
                            location=chunk.location,
                            fact=chunk.text[:1200],
                            quality="extracted",
                        )
                    )
            if prepared_embeddings is not None:
                result = repo.publish_embeddings(prepared_embeddings)
            if bim_index is not None:
                # A parsed IFC only becomes the active source when this transaction publishes it.
                active = repo.bim_index(job.project_id)
                active_revision = active.revision if active else None
                if (
                    not isinstance(job.request, BIMImport)
                    or job.request.base_revision != active_revision
                ):
                    raise Conflict(
                        "The active IFC changed after this import was submitted; "
                        "re-upload to confirm replacement"
                    )
                current_state = repo.state(job.project_id)
                repo.save_bim_index(bim_index)
                if bim_revision is not None:
                    if (
                        repo.bim_revision_snapshot(
                            job.project_id, bim_revision.source_id, bim_revision.revision_id
                        )
                        is not None
                    ):
                        raise Conflict("This source revision was imported by another job")
                    repo.add_bim_revision_snapshot(bim_revision)
                repo.save_state(revise(current_state, current_state.work_packages, {"bim"}))
            for item in evidence:
                repo.save_evidence(item)
            result["evidence_ids"] = [item.id for item in evidence]
            result["snapshot_id"] = snapshot.id
            if isinstance(job.request, (BIMImport, DocumentImport)):
                result["source_id"] = job.request.source_id
                result["source_revision_id"] = job.request.source_revision_id
            repo.save_job(job.model_copy(update={"snapshot_id": snapshot.id, "result": result}))
            repo.save_run(
                current.model_copy(
                    update={"status": "COMPLETED", "error": None, "updated_at": utcnow()}
                )
            )
            emit(repo, run_id, "STEP_FINISHED", stepName=job.request.kind)
            custom(
                repo,
                run_id,
                "capability-result",
                {"job_id": run_id, "capability": job.request.kind},
            )
            emit(repo, run_id, "RUN_FINISHED")
            repo.audit(
                AuditRecord(
                    project_id=job.project_id,
                    action="CAPABILITY_COMPLETED",
                    actor=job.requested_by,
                    run_id=run_id,
                    snapshot_id=snapshot.id,
                    detail={"capability": job.request.kind},
                )
            )
        return "COMPLETED"
