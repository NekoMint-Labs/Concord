import re
import secrets
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CCA_", env_file=".env", extra="ignore")
    profile: Literal["local", "desktop", "server", "full"] = "local"
    data_dir: Path = Path(".data")
    database_url: str = ""
    runtime_database_url: str = ""
    dbos_app_name: str = "cca"
    runtime: Literal["dbos", "temporal"] = "dbos"
    diagnostic_runtime: bool = False
    api_token: str = "local-demo-admin"
    viewer_token: str = "local-demo-viewer"
    coordinator_token: str = "local-demo-coordinator"
    approver_token: str = "local-demo-approver"
    safety_token: str = "local-demo-safety"
    seed_demo: bool = True
    host: str = "127.0.0.1"
    port: int = Field(default=8000, ge=0, le=65535)
    cors_origins: list[str] = [
        "http://127.0.0.1:5173",
        "http://localhost:5173",
        "tauri://localhost",
        "http://tauri.localhost",
    ]
    reasoning: Literal["offline", "pydantic-ai"] = "offline"
    # Set this for a credentialed native or OpenAI-compatible model. Omit it only
    # when retaining a legacy PydanticAI identifier with its provider SDK env vars.
    model_provider: Literal["openai", "anthropic", "google", "openai-compatible"] | None = None
    reasoning_model: str = ""
    fast_model: str = ""
    vision_model: str = ""
    embedding_model: str = ""
    embedding_provider: Literal["deterministic-test", "openai-compatible"] = "deterministic-test"
    embedding_version: str = "fixture-v1"
    embedding_dimensions: int = Field(default=64, ge=1, le=4096)
    cloud_embedding_egress: bool = False
    model_api_key: str = ""
    model_base_url: str = ""
    vision_enabled: bool = False
    storage: Literal["local", "s3"] = "local"
    s3_endpoint: str = "localhost:9000"
    s3_bucket: str = "cca-files"
    s3_access_key: str = ""
    s3_secret_key: str = ""
    s3_secure: bool = True
    bim: Literal["structured", "ifcopenshell"] = "structured"
    ifc_path: Path | None = None
    document_parser: Literal["lightweight", "docling"] = "lightweight"
    optimization_enabled: bool = False
    vector_enabled: bool = False
    otel_enabled: bool = False
    otel_endpoint: str = "http://127.0.0.1:4318/v1/traces"
    temporal_address: str = "127.0.0.1:7233"
    temporal_namespace: str = "default"
    temporal_task_queue: str = "cca-coordination"
    max_upload_bytes: int = Field(default=25 * 1024 * 1024, ge=1)

    @model_validator(mode="after")
    def validate_profile(self) -> Self:
        self.data_dir = self.data_dir.resolve()
        if not self.database_url:
            self.database_url = f"sqlite:///{self.data_dir / 'app.db'}"
        if not self.runtime_database_url:
            self.runtime_database_url = f"sqlite:///{self.data_dir / 'runtime.db'}"
        if self.profile in {"local", "desktop"} and self.host not in {
            "127.0.0.1",
            "localhost",
            "::1",
        }:
            raise ValueError("Local/desktop may bind only to loopback")
        if self.profile == "desktop":
            if "seed_demo" not in self.model_fields_set:
                self.seed_demo = False
            if "bim" not in self.model_fields_set:
                self.bim = "ifcopenshell"
            if not self.database_url.startswith(
                "sqlite:"
            ) or not self.runtime_database_url.startswith("sqlite:"):
                raise ValueError(
                    "Embedded desktop requires SQLite application and runtime databases"
                )
            if self.runtime != "dbos" or self.storage != "local":
                raise ValueError("Embedded desktop requires DBOS and local files")
            # Only the per-launch administrator token is handed to the local webview.
            for field in (
                "api_token",
                "viewer_token",
                "coordinator_token",
                "approver_token",
                "safety_token",
            ):
                if getattr(self, field).startswith("local-demo-"):
                    setattr(self, field, secrets.token_urlsafe(48))
            if len(self.api_token) < 32:
                raise ValueError("Desktop requires a per-launch secret of at least 32 characters")
        tokens = [
            self.api_token,
            self.viewer_token,
            self.coordinator_token,
            self.approver_token,
            self.safety_token,
        ]
        if len(set(tokens)) != len(tokens) or any(not token for token in tokens):
            raise ValueError("Each principal requires a distinct nonempty token")
        if self.profile in {"server", "full"}:
            if not self.database_url.startswith("postgresql"):
                raise ValueError("Server/full requires an explicit PostgreSQL database URL")
            if any(token.startswith("local-demo-") or len(token) < 32 for token in tokens):
                raise ValueError(
                    "Server/full requires five distinct secret bearer tokens of "
                    "at least 32 characters"
                )
        if self.runtime == "dbos" and not re.fullmatch(r"[a-z0-9_-]{3,30}", self.dbos_app_name):
            raise ValueError(
                "DBOS application name must be 3-30 lowercase letters, "
                "numbers, dashes, or underscores"
            )
        if self.diagnostic_runtime and self.profile != "local":
            raise ValueError(
                "Diagnostic non-durable runtime is only allowed in the "
                "explicit local diagnostic mode"
            )
        if self.vector_enabled and not self.database_url.startswith("postgresql"):
            raise ValueError(
                "pgvector is only supported with PostgreSQL; local FTS needs no vector service"
            )
        if self.embedding_provider == "openai-compatible" and self.vector_enabled:
            if (
                not self.embedding_model
                or not self.embedding_version
                or self.embedding_version == "fixture-v1"
            ):
                raise ValueError("Real embeddings require explicit model/version metadata")
        if self.reasoning == "pydantic-ai" and not self.reasoning_model:
            raise ValueError("PydanticAI reasoning requires CCA_REASONING_MODEL")
        uses_configured_model = self.reasoning == "pydantic-ai" or self.vision_enabled
        if uses_configured_model and self.model_provider and not self.model_api_key:
            raise ValueError("Configured model providers require CCA_MODEL_API_KEY")
        if self.model_base_url and self.model_provider != "openai-compatible":
            raise ValueError("CCA_MODEL_BASE_URL requires CCA_MODEL_PROVIDER=openai-compatible")
        if self.vision_enabled and not self.vision_model:
            raise ValueError("Vision enablement requires CCA_VISION_MODEL")
        return self
