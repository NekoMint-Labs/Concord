"""Bind and fence the complete engineering input set, including pinned IDS rules."""

from collections import defaultdict

from app.domain.engineering import CapabilityInput, ReCheck
from app.domain.errors import Conflict


def dependency_groups(dependencies):
    groups = defaultdict(list)
    for index, dependency in enumerate(dependencies):
        groups[dependency.group_id or f"dependency:{index}"].append(dependency)
    return groups


def validate_groups(dependencies):
    if any(d.group_id and d.group_id.startswith("dependency:") for d in dependencies):
        raise Conflict("dependency: is reserved for ungrouped runtime inputs")
    for group, members in dependency_groups(dependencies).items():
        if not members[0].group_id:
            continue
        if (
            len(members) < 2
            or len({d.input_role for d in members}) != len(members)
            or len({d.source_id for d in members}) != len(members)
            or len({(d.capability, d.expected_condition, d.requirements_kind) for d in members})
            != 1
        ):
            raise Conflict(f"Invalid engineering dependency group: {group}")


def bind_inputs(repo, project_id, dependencies):
    inputs = []
    uses_ids = any(d.requirements_kind == "ids" for d in dependencies)
    selection = repo.ids_requirements(project_id) if uses_ids else None
    for group, members in dependency_groups(dependencies).items():
        for dependency in members:
            current = repo.latest_source_revision(project_id, dependency.source_id)
            if current is None:
                raise Conflict("Engineering input has no source revision")
            inputs.append(
                CapabilityInput(
                    group_id=group,
                    role=dependency.input_role or "model",
                    source_id=dependency.source_id,
                    from_revision_id=dependency.source_revision_id,
                    source_revision_id=current.id,
                    sha256=current.sha256,
                    target=dependency.target.model_copy(update={"source_revision_id": current.id}),
                )
            )
        if members[0].requirements_kind == "ids" and selection:
            inputs.append(
                CapabilityInput(
                    group_id=group,
                    role="requirements",
                    source_id=selection.source_id,
                    from_revision_id=selection.revision_id,
                    source_revision_id=selection.revision_id,
                    sha256=selection.sha256,
                )
            )
    return tuple(inputs), selection


def inputs_current(repo, check: ReCheck) -> bool:
    if not check.inputs:  # Legacy single-source records remain readable and fenced.
        latest = repo.latest_source_revision(check.project_id, check.source_id)
        return latest is not None and latest.id == check.source_revision_id
    for item in check.inputs:
        revision = repo.source_revision(check.project_id, item.source_id, item.source_revision_id)
        if revision.sha256 != item.sha256:
            return False
        if item.role != "requirements":
            latest = repo.latest_source_revision(check.project_id, item.source_id)
            if latest is None or latest.id != item.source_revision_id:
                return False
    if any(d.requirements_kind == "ids" for d in check.dependencies):
        return repo.ids_requirements(check.project_id) == check.ids_requirements
    return True
