import logging
from contextlib import ExitStack
from dataclasses import dataclass

from app.adapters.actions_local import SimulatedActionExecutor
from app.adapters.agent_offline import OfflineInvestigationEngine
from app.adapters.demo import LocalGeoProvider, StructuredBIMProvider, demo_state
from app.adapters.documents_light import LightweightDocumentParser
from app.adapters.observability import Telemetry
from app.adapters.observed_boundaries import (
    ObservedExecutor,
    ObservedFileStore,
    ObservedReasoning,
    ObservedWorkflow,
)
from app.adapters.persistence.database import SQLRepositoryFactory, make_engine, migrate
from app.adapters.persistence.documents import DocumentRepository
from app.adapters.reasoning_offline import OfflineReasoningEngine
from app.adapters.resolver_simple import SimpleResolver
from app.adapters.storage_local import LocalFileStore
from app.application.actions import ActionService
from app.application.agent_control import AgentControlService
from app.application.analysis import AnalysisService
from app.application.baselines import BaselineService
from app.application.capability_jobs import CapabilityJobService
from app.application.coordination import CoordinationService
from app.application.investigations import InvestigationService
from app.application.project_sources import ProjectSourceService
from app.application.projects import ProjectService
from app.application.source_imports import SourceImportService
from app.application.workflow import WorkflowCoordinator
from app.bootstrap_capabilities import build_capability_jobs
from app.domain.actions import Principal
from app.domain.errors import DomainError
from app.ports.services import DurableRuntime
from app.settings import Settings


@dataclass
class Services:
    settings: Settings
    factory: SQLRepositoryFactory
    coordination: CoordinationService
    analysis: AnalysisService
    actions: ActionService
    workflow: WorkflowCoordinator
    runtime: DurableRuntime
    documents: DocumentRepository
    bim: object
    geo: LocalGeoProvider
    jobs: CapabilityJobService
    storage: object
    telemetry: Telemetry
    projects: ProjectService
    sources: ProjectSourceService
    baselines: BaselineService
    agent: AgentControlService
    investigations: InvestigationService
    source_imports: SourceImportService

    resources: ExitStack

    def close(self) -> None:
        self.resources.close()


def build_services(settings: Settings) -> Services:
    with ExitStack() as resources:
        settings.data_dir.mkdir(parents=True, exist_ok=True)
        engine = make_engine(settings.database_url)
        resources.callback(engine.dispose)
        migrate(engine)
        telemetry = Telemetry(settings.otel_enabled, settings.otel_endpoint)
        resources.callback(telemetry.close)
        factory = SQLRepositoryFactory(engine, telemetry)
        reasoning = OfflineReasoningEngine()
        if settings.reasoning == "pydantic-ai":
            from app.adapters.reasoning_pydantic import PydanticAIReasoningEngine

            reasoning = PydanticAIReasoningEngine(
                settings.reasoning_model,
                settings.model_api_key,
                settings.model_base_url,
                provider=settings.model_provider,
            )
        reasoning = ObservedReasoning(reasoning, telemetry)
        resources.callback(reasoning.close)
        analysis = AnalysisService(factory, reasoning, SimpleResolver())
        runtime_name = "diagnostic-NON-DURABLE" if settings.diagnostic_runtime else settings.runtime
        coordination = CoordinationService(factory, analysis, runtime_name)
        actions = ActionService(
            factory, analysis, ObservedExecutor(SimulatedActionExecutor(), telemetry)
        )
        workflow = WorkflowCoordinator(factory, analysis, coordination, actions)
        storage = LocalFileStore(settings.data_dir / "files", settings.max_upload_bytes)
        if settings.storage == "s3":
            from app.adapters.storage_s3 import S3CompatibleFileStore

            storage = S3CompatibleFileStore(
                settings.s3_endpoint,
                settings.s3_bucket,
                settings.s3_access_key,
                settings.s3_secret_key,
                settings.s3_secure,
                settings.max_upload_bytes,
            )
        storage = ObservedFileStore(storage, telemetry, settings.storage)
        parser = LightweightDocumentParser()
        if settings.document_parser == "docling":
            from app.adapters.documents_docling import DoclingDocumentParser

            parser = DoclingDocumentParser()
        bim = StructuredBIMProvider()
        if settings.bim == "ifcopenshell":
            from app.adapters.bim_ifc import IfcOpenShellBIMProvider

            bim = IfcOpenShellBIMProvider(settings.ifc_path)
        documents = DocumentRepository(engine, storage, parser)
        investigator = OfflineInvestigationEngine()
        if settings.reasoning == "pydantic-ai":
            from app.adapters.agent_pydantic import PydanticAIInvestigationEngine

            investigator = PydanticAIInvestigationEngine(
                settings.reasoning_model,
                settings.model_api_key,
                settings.model_base_url,
                provider=settings.model_provider,
            )
        resources.callback(investigator.close)
        investigations = InvestigationService(factory, investigator, documents)
        analysis.investigations = investigations
        jobs = build_capability_jobs(settings, factory, runtime_name, storage, documents, resources)
        workflow.capabilities = jobs
        observed_workflow = ObservedWorkflow(workflow, telemetry)
        if settings.diagnostic_runtime:
            from app.adapters.runtime_diagnostic import DiagnosticRuntime

            runtime = DiagnosticRuntime(observed_workflow)
        elif settings.runtime == "dbos":
            from app.adapters.runtime_dbos import DBOSRuntime

            runtime = DBOSRuntime(
                observed_workflow,
                settings.runtime_database_url,
                factory,
                app_name=settings.dbos_app_name,
            )
        else:
            from app.adapters.runtime_temporal import TemporalRuntime

            runtime = TemporalRuntime(
                observed_workflow,
                settings.temporal_address,
                settings.temporal_namespace,
                settings.temporal_task_queue,
                factory=factory,
            )
        resources.callback(runtime.close)
        agent_control = AgentControlService(factory, runtime, runtime_name)
        result = Services(
            settings,
            factory,
            coordination,
            analysis,
            actions,
            workflow,
            runtime,
            documents,
            bim,
            LocalGeoProvider(),
            jobs,
            storage,
            telemetry,
            ProjectService(factory),
            ProjectSourceService(factory, storage, settings.max_upload_bytes, agent_control),
            BaselineService(factory),
            agent_control,
            investigations,
            SourceImportService(factory, jobs, runtime),
            resources,
        )
        if settings.seed_demo:
            coordination.seed(demo_state(), Principal(id="bootstrap", role="admin"))
            if not documents.documents("harbor-east"):
                seed_documents = DocumentRepository(engine, storage, LightweightDocumentParser())
                try:
                    seed_documents.import_file(
                        "harbor-east",
                        "MEP-coordination-V16.md",
                        b"# MEP coordination note / V16\n\n"
                        b"Level 02 East wing: duct route E-01 uses four qualified "
                        b"installers and a scissor lift.\n"
                        b"Structure handover WP-100 must be accepted before WP-200 begins.\n"
                        b"\f# Revision control\n"
                        b"Any new drawing revision requires workface acknowledgement "
                        b"before installation.\n"
                        b"This fixture is synthetic, not construction or safety advice.\n",
                    )
                except DomainError as exc:
                    logging.getLogger("cca").warning(
                        "Seed document unavailable", extra={"error_category": exc.code}
                    )
        # Outbox recovery: committed events may have outlived a failed runtime start call.
        with factory.open() as repo:
            queued = [r for r in repo.pending_runs() if r.status == "QUEUED"]
        for run in queued:
            # A persisted resume must retain its resume semantics after a crash
            # between the domain commit and runtime dispatch. Temporal rejects
            # duplicate closed executions on ordinary start, but resume uses
            # atomic signal-with-start and allows a new execution.
            if run.generation:
                runtime.resume(run.id)
            else:
                runtime.start(run.id)
        result.resources = resources.pop_all()
        return result
