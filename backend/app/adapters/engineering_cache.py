"""Stable cache identities for bounded engineering adapter results."""

import hashlib
import json
from collections.abc import Mapping
from typing import Any


def engineering_cache_key(
    *,
    source_hashes: tuple[str, ...],
    engine: str,
    engine_version: str,
    parameters: Mapping[str, Any] | None = None,
) -> str:
    """Return a canonical digest for one immutable engineering computation.

    Source hashes stay ordered because paired inputs have distinct roles. Parameters
    are serialized canonically so equivalent mappings produce the same identity.
    """
    payload = {
        "source_hashes": source_hashes,
        "engine": engine,
        "engine_version": engine_version,
        "parameters": parameters or {},
    }
    encoded = json.dumps(
        payload,
        allow_nan=False,
        ensure_ascii=True,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def ids_cache_key(
    *, source_hash: str, requirements_hash: str, engine: str, engine_version: str
) -> str:
    """Identify an IDS run, including the exact requirements document bytes."""
    return engineering_cache_key(
        source_hashes=(source_hash,),
        engine=engine,
        engine_version=engine_version,
        parameters={"requirements_hash": requirements_hash},
    )
