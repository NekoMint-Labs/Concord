"""Non-destructive capability inspection; absence of a paid probe is not health proof."""

from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError

from app.adapters.capability_environment import fixed, model_credential, optional
from app.adapters.engineering_environment import engineering_status
from app.domain.runs import Capability


def capabilities(svc, probe: bool = False) -> list[Capability]:
    settings = svc.settings
    database_ok = False
    try:
        with svc.factory.engine.connect() as connection:
            if connection.dialect.name == "postgresql":
                connection.execute(text("SET LOCAL statement_timeout = '2000ms'"))
            database_ok = connection.execute(text("SELECT 1")).scalar() == 1
    except SQLAlchemyError:
        pass
    result = [
        Capability(
            name="database",
            implementation=svc.factory.engine.dialect.name,
            status="enabled" if database_ok else "unhealthy",
            enabled=True,
            dependency_available=True,
            service_reachable=database_ok,
            reason="Read-only SELECT 1 completed" if database_ok else "Database probe failed",
        )
    ]
    runtime = fixed(
        "runtime",
        svc.runtime.name,
        "Runtime initialized; workflow status is individually inspectable",
    )
    if settings.diagnostic_runtime:
        runtime = runtime.model_copy(
            update={
                "status": "unhealthy",
                "reason": "Diagnostic harness: NO durability or background execution",
            }
        )
    elif callable(getattr(svc.runtime, "health", None)):
        ok, reason = svc.runtime.health()
        runtime = runtime.model_copy(
            update={"status": "enabled" if ok else "unhealthy", "reason": reason}
        )
    result.append(runtime)
    result.append(
        fixed("reasoning", "offline", "Deterministic offline reasoning; no cloud egress")
        if settings.reasoning == "offline"
        else optional(
            "reasoning",
            "PydanticAI",
            "pydantic_ai",
            True,
            model_credential(settings.reasoning_model, settings.model_api_key),
            "Configured model; no paid health probe",
            "pydantic-ai-slim",
        )
    )
    storage = (
        fixed("storage", "LocalFileStore", "Controlled local file directory")
        if settings.storage == "local"
        else optional(
            "storage",
            "S3-compatible / MinIO SDK",
            "minio",
            True,
            bool(settings.s3_access_key and settings.s3_secret_key),
        )
    )
    if probe and storage.status == "enabled":
        ok, reason = svc.storage.health()
        storage = storage.model_copy(
            update={
                "service_reachable": ok,
                "status": "enabled" if ok else "unhealthy",
                "reason": reason,
            }
        )
    result.append(storage)
    bim = (
        fixed("BIM", "StructuredBIMProvider", "Structured BIM fixture")
        if settings.bim == "structured"
        else optional(
            "BIM",
            "IfcOpenShell",
            "ifcopenshell",
            True,
            reason="IFC is parsed on demand; successful import is shown separately",
        )
    )
    if settings.bim == "ifcopenshell" and (
        settings.ifc_path is None or not settings.ifc_path.is_file()
    ):
        bim = bim.model_copy(
            update={
                "status": "unhealthy",
                "reason": "Configured local IFC file is missing; upload/import remains separate",
            }
        )
    result.append(bim)
    result.append(
        fixed("document parser", "LightweightDocumentParser", "Local text/Markdown parsing")
        if settings.document_parser == "lightweight"
        else optional(
            "document parser",
            "Docling",
            "docling",
            True,
            reason="Local parsing; model assets may need provisioning; no cloud upload",
        )
    )
    result.extend(
        [
            fixed(
                "GIS",
                "MapLibre / local GeoJSON",
                "Local site data; browser reports WebGL readiness separately",
            ),
            fixed(
                "BIM viewer",
                "That Open Engine",
                "Browser dependency/render readiness is not asserted by this server",
                enabled=False,
            ),
            fixed(
                "desktop host",
                "Tauri 2",
                (
                    "Launch profile only; native build/host readiness is not "
                    "established by this endpoint"
                ),
                enabled=settings.profile == "desktop",
            ),
            optional(
                "DBOS adapter",
                "DBOS",
                "dbos",
                settings.runtime == "dbos" and not settings.diagnostic_runtime,
            ),
            optional(
                "distributed runtime", "Temporal", "temporalio", settings.runtime == "temporal"
            ),
            optional("IFC import", "IfcOpenShell", "ifcopenshell", True),
            *engineering_status(settings, svc.rechecks.capabilities),
            optional(
                "BCF transport",
                "buildingSMART BCF client",
                "bcf",
                False,
                distribution="bcf-client",
            ),
            optional(
                "local OCR",
                "RapidOCR / ONNX Runtime",
                "rapidocr",
                False,
                distribution="rapidocr",
                reason="Dependency inspection only; local ONNX models and OCR are not probed",
            ),
            optional("optimization", "OR-Tools CP-SAT", "ortools", settings.optimization_enabled),
            optional(
                "advanced documents", "Docling", "docling", settings.document_parser == "docling"
            ),
            optional(
                "object storage",
                "S3-compatible",
                "minio",
                settings.storage == "s3",
                bool(settings.s3_access_key and settings.s3_secret_key),
            ),
            optional(
                "vision",
                "PydanticAI vision_model",
                "pydantic_ai",
                settings.vision_enabled,
                model_credential(settings.vision_model, settings.model_api_key),
                distribution="pydantic-ai-slim",
            ),
        ]
    )
    vector = optional(
        "vector retrieval", "PostgreSQL / pgvector", "pgvector", settings.vector_enabled
    )
    if settings.vector_enabled:
        descriptor = svc.jobs.semantic.embeddings.descriptor
        vector = vector.model_copy(
            update={
                "reason": vector.reason
                + (
                    "; TEST-ONLY token-hash vectors, not language semantics"
                    if descriptor.test_only
                    else "; selected text egress requires consent"
                )
            }
        )
        if probe:
            ok, reason = svc.jobs.semantic.health()
            vector = vector.model_copy(
                update={
                    "service_reachable": ok,
                    "status": "enabled" if ok else "unhealthy",
                    "reason": reason,
                }
            )
    result.append(vector)
    result.append(
        Capability(
            name="observability",
            implementation="OpenTelemetry",
            enabled=settings.otel_enabled,
            dependency_available=svc.telemetry.available,
            status="enabled"
            if svc.telemetry.enabled
            else ("available_disabled" if svc.telemetry.available else "unavailable_dependency"),
            reason=svc.telemetry.reason,
        )
    )
    result.extend(svc.comparisons.capability_status())
    return result
