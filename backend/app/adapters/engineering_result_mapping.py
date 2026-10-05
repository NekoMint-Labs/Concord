"""Map single-source engineering results into the platform publication contract."""

import json
from uuid import NAMESPACE_URL, uuid5

from app.adapters.engineering_results import IDSValidationResult
from app.domain.engineering import EngineeringPublication
from app.domain.engineering_refs import BimTarget
from app.domain.errors import DomainError
from app.domain.models import Evidence


def ids_publication(
    result: IDSValidationResult, *, snapshot_id: str, operation_id: str
) -> EngineeringPublication:
    """Build revision- and hash-bound Evidence for IDS violations.

    The snapshot and project/revision ownership are still validated by the
    platform publisher. The adapter's SHA-256 proves which IFC bytes were
    validated; revision IDs remain the stable engineering identity. Remapping
    the same result/snapshot/operation produces identical IDs and timestamps
    for safe publication retries. This mapper does not confirm Findings or
    infer resolved checks from an empty violation list.
    """
    if len(result.violations) > 1000:
        raise DomainError("IDS publication exceeds the platform evidence limit")
    evidence = []
    for index, violation in enumerate(result.violations):
        if (
            violation.source_id != result.source_id
            or violation.source_revision_id != result.source_revision_id
            or violation.engine != result.engine
            or violation.engine_version != result.engine_version
        ):
            raise DomainError("IDS violation provenance does not match its validation result")
        global_ids = (violation.global_id,) if violation.global_id else ()
        evidence.append(
            Evidence(
                id=str(
                    uuid5(
                        NAMESPACE_URL,
                        json.dumps(
                            [
                                "concord:ids-evidence",
                                snapshot_id,
                                operation_id,
                                result.source_id,
                                result.source_revision_id,
                                index,
                            ]
                        ),
                    )
                ),
                snapshot_id=snapshot_id,
                provider=f"{violation.engine}/{violation.engine_version}",
                source_id=result.source_id,
                source_revision=result.source_hash,
                source_revision_id=result.source_revision_id,
                observed_at=result.validated_at,
                element_ids=global_ids,
                fact=(
                    f"IDS specification '{violation.specification}' failed: {violation.reason}; "
                    f"IDS SHA-256={result.requirements_hash}"
                ),
                quality="structured",
                viewer_target=(
                    BimTarget(source_revision_id=result.source_revision_id, global_ids=global_ids)
                    if global_ids
                    else None
                ),
            )
        )
    return EngineeringPublication(operation_id=operation_id, evidence=tuple(evidence))
