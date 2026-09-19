import logging
import time
from contextlib import asynccontextmanager
from pathlib import Path
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse

from app.adapters.observability import configure_logging
from app.api import (
    agent,
    baselines,
    bim_revisions,
    capability_jobs,
    project_lifecycle,
    project_sources,
    projects,
    resources,
    runs,
)
from app.api.web import mount_web
from app.bootstrap import build_services
from app.domain.errors import DomainError
from app.settings import Settings


def create_app(settings: Settings | None = None, service_override=None) -> FastAPI:
    settings = settings or Settings()
    configure_logging()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        import asyncio

        app.state.services = service_override or await asyncio.to_thread(build_services, settings)
        try:
            yield
        finally:
            if service_override is None:
                await asyncio.to_thread(app.state.services.close)

    app = FastAPI(title="Construction Coordination Agent", version="0.1.0", lifespan=lifespan)
    app.include_router(agent.router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST"],
        allow_headers=["Authorization", "Content-Type", "Last-Event-ID", "X-Request-ID"],
    )
    if settings.profile in {"local", "desktop"}:
        app.add_middleware(
            TrustedHostMiddleware,
            allowed_hosts=["localhost", "127.0.0.1", "[::1]", "testserver", "tauri.localhost"],
        )

    @app.exception_handler(DomainError)
    async def domain_error(_request: Request, exc: DomainError):
        return JSONResponse(status_code=exc.status, content={"code": exc.code, "detail": str(exc)})

    @app.middleware("http")
    async def request_log(request: Request, call_next):
        started = time.perf_counter()
        request_id = str(uuid4())
        from contextlib import nullcontext

        svc = getattr(request.app.state, "services", None)
        trace = (
            svc.telemetry.span("http.request", http_method=request.method) if svc else nullcontext()
        )
        with trace as current_span:
            response = await call_next(request)
            if current_span is not None:
                current_span.set_attribute("http.response.status_code", response.status_code)
                route = request.scope.get("route")
                if route is not None:
                    current_span.set_attribute("http.route", getattr(route, "path", "unknown"))
        response.headers["X-Request-ID"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        logging.getLogger("cca").info(
            "%s %s %s",
            request.method,
            request.url.path,
            response.status_code,
            extra={
                "request_id": request_id,
                "latency_ms": round((time.perf_counter() - started) * 1000, 2),
            },
        )
        return response

    @app.get("/health")
    def health():
        return {
            "status": "ok",
            "service": "construction-coordination-agent",
            "profile": settings.profile,
            "runtime": "diagnostic-NON-DURABLE"
            if settings.diagnostic_runtime
            else settings.runtime,
        }

    app.include_router(projects.router)
    app.include_router(project_lifecycle.router)
    app.include_router(project_sources.router)
    app.include_router(baselines.router)
    app.include_router(bim_revisions.router)
    app.include_router(runs.router)
    app.include_router(resources.router)
    app.include_router(capability_jobs.router)
    # The production UI is optional for API-only development. No source directory is served.
    web_dist = Path(__file__).resolve().parents[3] / "frontend" / "dist"
    mount_web(app, web_dist)
    return app


app = create_app()
