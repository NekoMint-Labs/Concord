"""Bind selectors to real project identities; instructions may only narrow them."""

import re

from app.domain.agent import AgentRequest, AgentScope
from app.domain.errors import DomainError
from app.domain.models import ProjectState
from app.ports.coordination import CoordinationRepository


def package_ids(state: ProjectState, scope: AgentScope) -> frozenset[str]:
    return frozenset(
        p.id
        for p in state.work_packages
        if (not scope.work_package_ids or p.id in scope.work_package_ids)
        and (not scope.area_ids or p.area_id in scope.area_ids)
        and (not scope.element_ids or set(p.element_ids).intersection(scope.element_ids))
    )


def _mentioned(value: str, instruction: str) -> bool:
    return bool(
        value and re.search(r"(?<![\w-])" + re.escape(value) + r"(?![\w-])", instruction, re.I)
    )


def bind_scope(
    repo: CoordinationRepository, project_id: str, request: AgentRequest
) -> AgentRequest:
    state, scope = repo.state(project_id), request.scope
    if set(scope.work_package_ids) - {p.id for p in state.work_packages}:
        raise DomainError("Work package scope does not belong to this project")
    if set(scope.area_ids) - {a.id for a in state.areas}:
        raise DomainError("Area scope does not belong to this project")
    mentioned_packages = {
        p.id for p in state.work_packages if _mentioned(p.id, request.instruction)
    }
    mentioned_areas = {
        a.id
        for a in state.areas
        if any(_mentioned(value, request.instruction) for value in (a.id, a.name, a.floor))
    }
    codes = set(re.findall(r"\bWP-[A-Za-z0-9-]+\b", request.instruction, re.I))
    if {c.casefold() for c in codes} - {p.id.casefold() for p in state.work_packages}:
        raise DomainError("Instruction names an unknown work package; select a valid scope")
    # Recognized identifiers are constraints, never permission to widen a selection.
    for field, mentioned in (
        ("work_package_ids", mentioned_packages),
        ("area_ids", mentioned_areas),
    ):
        if mentioned:
            original = set(getattr(scope, field))
            narrowed = mentioned & original if original else mentioned
            if not narrowed:
                raise DomainError("Instruction conflicts with the selected scope")
            scope = scope.model_copy(update={field: tuple(sorted(narrowed))})
    if re.search(r"\bonly\b|仅(?:看|调查|限)|只(?:看|调查|关注)", request.instruction, re.I):
        if not (mentioned_packages or mentioned_areas or scope != AgentScope()):
            raise DomainError(
                "Specify the restricted scope with project area/work-package selectors"
            )
    if (scope.work_package_ids or scope.area_ids) and not package_ids(state, scope):
        raise DomainError("The intersection of selected areas, work packages and elements is empty")
    if scope.element_ids:
        index = repo.bim_index(project_id)
        known = {e for p in state.work_packages for e in p.element_ids}
        if index:
            known.update(str(e.get("id", "")) for e in index.elements)
        if set(scope.element_ids) - known:
            raise DomainError("Selected BIM elements are not present in this project")
    if scope.source_id:
        repo.project_source(project_id, scope.source_id)
        latest = repo.latest_source_revision(project_id, scope.source_id)
        if latest is None:
            raise DomainError("Source scope requires a stored revision")
        target = scope.to_revision_id or latest.id
        baseline = repo.latest_baseline(project_id)
        accepted = (
            next((e.revision_id for e in baseline.entries if e.source_id == scope.source_id), None)
            if baseline
            else None
        )
        origin = scope.from_revision_id or (accepted if accepted != target else None)
        for revision_id in (origin, target):
            if revision_id:
                repo.source_revision(project_id, scope.source_id, revision_id)
        scope = scope.model_copy(update={"from_revision_id": origin, "to_revision_id": target})
    return request.model_copy(update={"scope": scope})
