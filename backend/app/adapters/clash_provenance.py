"""Source attribution for donor clash rows; detection remains entirely IfcClash-owned."""

from collections.abc import Collection, Mapping
from typing import Any

from app.domain.errors import ProviderError


def orient_clash_row(
    row: Mapping[str, Any], first_ids: Collection[str], second_ids: Collection[str]
) -> dict[str, Any]:
    """IfcClash geometry results need not preserve input-group order.

    Use the donor's already-loaded, filtered groups; do not reparse source bytes
    or guess by class/name. Conflicting cross-model identities fail closed.
    """
    first, second = str(row["a_global_id"]), str(row["b_global_id"])
    forward = first in first_ids and second in second_ids
    reverse = second in first_ids and first in second_ids
    if not (forward or reverse) or (forward and reverse and first != second):
        raise ProviderError("IfcClash source attribution is absent or ambiguous")
    output = dict(row)
    if not forward:
        for suffix in ("global_id", "ifc_class", "name"):
            output[f"a_{suffix}"] = row[f"b_{suffix}"]
            output[f"b_{suffix}"] = row[f"a_{suffix}"]
        output["p1"], output["p2"] = row.get("p2", ()), row.get("p1", ())
    return output
