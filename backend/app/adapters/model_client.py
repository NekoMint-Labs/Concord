"""Configured model construction and bounded calls, shared by reasoning and vision."""

import asyncio
import logging
import random
import time
from typing import Any
from urllib.parse import urlparse

from app.domain.errors import CapabilityUnavailable, ProviderError

_NATIVE_PROVIDERS = {"openai", "anthropic", "google", "openai-compatible"}
_LEGACY_PREFIXES = {
    "openai": ("openai-compatible", False),
    "openai-chat": ("openai-compatible", False),
    "openai-responses": ("openai-compatible", True),
    "anthropic": ("anthropic", False),
    "google": ("google", False),
}


def _model_selection(
    identifier: str, provider: str | None, api_key: str, base_url: str
) -> tuple[str | None, str, bool]:
    """Return the selected provider, bare model name, and OpenAI Responses flag."""
    prefix, separator, name = identifier.partition(":")
    legacy = _LEGACY_PREFIXES.get(prefix) if separator else None
    if not legacy:
        return provider, identifier, False
    if provider is None and prefix in {"anthropic", "google"} and not api_key and not base_url:
        # Preserve legacy PydanticAI identifiers that obtain credentials from their SDK.
        return None, identifier, False
    legacy_provider, responses = legacy
    if provider and provider != legacy_provider:
        raise CapabilityUnavailable(
            f"CCA_MODEL_PROVIDER={provider} conflicts with model identifier prefix {prefix}:"
        )
    return legacy_provider, name, responses


def _validate_base_url(base_url: str) -> None:
    if not base_url:
        return
    parsed = urlparse(base_url)
    if not parsed.scheme or not parsed.netloc:
        raise CapabilityUnavailable("Model endpoint must be an absolute URL")
    if parsed.scheme != "https" and not (
        parsed.scheme == "http" and parsed.hostname in {"localhost", "127.0.0.1", "::1"}
    ):
        raise CapabilityUnavailable(
            "Model endpoint must use HTTPS, except explicit loopback development"
        )


def configured_model(
    identifier: str, api_key: str, base_url: str = "", provider: str | None = None
) -> Any:
    """Build a credentialed PydanticAI model without making a provider request."""
    if not identifier:
        raise CapabilityUnavailable("A concrete model identifier is required")
    provider, model_name, responses = _model_selection(identifier, provider, api_key, base_url)
    if provider is None:
        # Existing PydanticAI identifiers retain their SDK/environment-based behavior.
        return identifier
    if provider not in _NATIVE_PROVIDERS:
        raise CapabilityUnavailable(f"Unsupported model provider: {provider}")
    if not api_key:
        raise CapabilityUnavailable("CCA_MODEL_API_KEY is required for configured model reasoning")
    _validate_base_url(base_url)
    if base_url and provider != "openai-compatible":
        raise CapabilityUnavailable(
            "CCA_MODEL_BASE_URL is only supported with CCA_MODEL_PROVIDER=openai-compatible"
        )
    try:
        if provider == "anthropic":
            from pydantic_ai.models.anthropic import AnthropicModel
            from pydantic_ai.providers.anthropic import AnthropicProvider

            return AnthropicModel(model_name, provider=AnthropicProvider(api_key=api_key))
        if provider == "google":
            from pydantic_ai.models.google import GoogleModel
            from pydantic_ai.providers.google import GoogleProvider

            return GoogleModel(model_name, provider=GoogleProvider(api_key=api_key))
        from pydantic_ai.models.openai import OpenAIChatModel, OpenAIResponsesModel
        from pydantic_ai.providers.openai import OpenAIProvider
    except ImportError as exc:
        raise CapabilityUnavailable("Install the models extra for PydanticAI") from exc
    model_class = OpenAIResponsesModel if responses else OpenAIChatModel
    return model_class(
        model_name, provider=OpenAIProvider(api_key=api_key, base_url=base_url or None)
    )


async def bounded_call(
    agent,
    prompt,
    *,
    deps=None,
    role: str,
    model_id: str,
    testing: bool = False,
    request_limit: int = 4,
):
    kwargs: dict[str, Any] = {"model_settings": {"timeout": 25, "max_tokens": 1600}}
    if deps is not None:
        kwargs["deps"] = deps
    if not testing:
        from pydantic_ai.usage import UsageLimits

        kwargs["usage_limits"] = UsageLimits(request_limit=request_limit, tool_calls_limit=6)
    started = time.monotonic()
    try:
        async with asyncio.timeout(85):
            for attempt in range(3):
                try:
                    result = await agent.run(prompt, **kwargs)
                    logging.getLogger("cca").info(
                        "Model call completed",
                        extra={
                            "provider": model_id.split(":", 1)[0],
                            "model_role": role,
                            "retry_count": attempt,
                            "latency_ms": round((time.monotonic() - started) * 1000),
                        },
                    )
                    return result.output
                except Exception as exc:
                    status = getattr(exc, "status_code", None)
                    transient = (
                        isinstance(exc, (TimeoutError, ConnectionError))
                        or status == 429
                        or (isinstance(status, int) and status >= 500)
                    )
                    if not transient or attempt == 2:
                        raise
                    headers = getattr(getattr(exc, "response", None), "headers", {})
                    retry_after = headers.get("Retry-After", "") if headers else ""
                    delay = (
                        min(float(retry_after), 8)
                        if str(retry_after).replace(".", "", 1).isdigit()
                        else (2**attempt + random.random())
                    )
                    await asyncio.sleep(max(0, delay))
    except Exception as exc:
        raise ProviderError(
            f"{role} failed or timed out; no fallback model or action was used"
        ) from exc
    raise ProviderError(f"{role} returned no structured output")
