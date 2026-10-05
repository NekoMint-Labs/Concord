"""Map each real clash to paired canonical Evidence without owning coordination."""

import json
import re
from math import isfinite
from uuid import NAMESPACE_URL, uuid5

from app.adapters.engineering_results import ClashRunResult
from app.domain.engineering import EngineeringPublication
from app.domain.engineering_refs import BimTarget
from app.domain.errors import DomainError
from app.domain.models import Evidence


def clash_publication(
    result: ClashRunResult, *, snapshot_id: str, operation_id: str
) -> EngineeringPublication:
    """Publish both sides together; never substitute one source for the other.

    An operation is immutable and idempotent through EngineeringPublisher. Each
    adjacent Evidence pair belongs to one detector row. No shared grouping field
    or Finding/ReCheck state is invented here. A still owns the multi-source job
    input, run fencing, cache reuse, persisted grouping and closure contract.
    """
    if len(result.evidence) > 500:
        raise DomainError("Clash publication exceeds the platform evidence limit")
    sources = (
        (result.source_id, result.source_revision_id, result.source_hash),
        (result.comparison_source_id, result.comparison_revision_id, result.comparison_source_hash),
    )
    if any(not source.strip() or not revision.strip() for source, revision, _ in sources):
        raise DomainError("Clash publication needs both source/revision identities")
    if sources[0][:2] == sources[1][:2]:
        raise DomainError("Clash publication needs two distinct revision-qualified inputs")
    evidence = []
    for index, row in enumerate(result.evidence):
        if (
            row.source_id != result.source_id
            or row.source_revision_id != result.source_revision_id
            or row.against_source_id != result.comparison_source_id
            or row.against_source_revision_id != result.comparison_revision_id
            or row.provider != result.engine
            or row.engine_version != result.engine_version
            or row.quality != "structured"
        ):
            raise DomainError("Clash Evidence provenance does not match its input pair")
        if len(row.element_ids) != 2 or any(
            not re.fullmatch(r"[0-3][0-9A-Za-z_$]{21}", identity) for identity in row.element_ids
        ):
            raise DomainError("Clash Evidence needs one valid GlobalId per source")
        if len(row.location) != 3 or not all(isfinite(value) for value in row.location):
            raise DomainError("Clash Evidence needs a finite three-coordinate location")
        input_context = json.dumps(
            {
                "inputs": sources,
                "engine": result.engine,
                "version": result.engine_version,
                "mode": result.mode,
                "parameters": result.parameters.model_dump(mode="json"),
            },
            sort_keys=True,
            separators=(",", ":"),
        )
        for side, (source, revision, digest) in enumerate(sources):
            guid = row.element_ids[side]
            evidence.append(
                Evidence(
                    id=str(
                        uuid5(
                            NAMESPACE_URL,
                            json.dumps(
                                [
                                    "concord:clash-evidence",
                                    snapshot_id,
                                    operation_id,
                                    index,
                                    side,
                                    source,
                                    revision,
                                ]
                            ),
                        )
                    ),
                    snapshot_id=snapshot_id,
                    provider=f"{result.engine}/{result.engine_version}",
                    source_id=source,
                    source_revision_id=revision,
                    source_revision=digest,
                    observed_at=result.checked_at,
                    element_ids=(guid,),
                    location=json.dumps(row.location, separators=(",", ":")),
                    fact=f"{row.fact}; clash row {index}, side {side}; inputs={input_context}",
                    quality="structured",
                    viewer_target=BimTarget(source_revision_id=revision, global_ids=(guid,)),
                )
            )
    return EngineeringPublication(operation_id=operation_id, evidence=tuple(evidence))
