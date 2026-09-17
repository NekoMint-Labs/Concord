"""Small project-structure writes with the same audit and freshness fence as coordination."""

from app.domain.actions import AuditRecord, Principal
from app.domain.errors import NotFound
from app.domain.models import Area, Project, ProjectState, SourceRevision, WorkPackage, new_id
from app.domain.project_lifecycle import CreateArea, CreateProject, CreateWorkPackage
from app.policies.actions import require
from app.ports.coordination import CoordinationRepository, RepositoryFactory


def record_lifecycle_change(
    repo: CoordinationRepository,
    state: ProjectState,
    principal: Principal,
    action: str,
    detail: dict[str, str | int | bool | None],
) -> None:
    repo.save_state(state.model_copy(update={"version": state.version + 1}))
    repo.audit(
        AuditRecord(project_id=state.project.id, action=action, actor=principal.id, detail=detail)
    )


class ProjectService:
    def __init__(self, factory: RepositoryFactory):
        self.factory = factory

    def create(self, request: CreateProject, principal: Principal) -> Project:
        require(principal, "ingest")
        project = Project(id=new_id(), **request.model_dump())
        # These are internal consistency tokens, not imported engineering sources or facts.
        sources = tuple(
            SourceRevision(source=name, revision="r1")
            for name in (
                "drawing",
                "bim",
                "schedule",
                "material",
                "inspection",
                "workforce",
                "equipment",
            )
        )
        state = ProjectState(project=project, areas=(), work_packages=(), sources=sources)
        with self.factory.open(project.id, write=True) as repo:
            repo.save_state(state)
            repo.audit(
                AuditRecord(project_id=project.id, action="PROJECT_CREATED", actor=principal.id)
            )
        return project

    def add_area(self, project_id: str, request: CreateArea, principal: Principal) -> Area:
        require(principal, "ingest")
        area = Area(id=new_id(), **request.model_dump())
        with self.factory.open(project_id, write=True) as repo:
            state = repo.state(project_id)
            state = state.model_copy(update={"areas": (*state.areas, area)})
            record_lifecycle_change(repo, state, principal, "AREA_CREATED", {"area_id": area.id})
        return area

    def add_work_package(
        self, project_id: str, request: CreateWorkPackage, principal: Principal
    ) -> WorkPackage:
        require(principal, "ingest")
        with self.factory.open(project_id, write=True) as repo:
            state = repo.state(project_id)
            if not any(area.id == request.area_id for area in state.areas):
                raise NotFound("Area does not belong to this project")
            package = WorkPackage(
                id=new_id(),
                **request.model_dump(),
                design_revision="",
                accepted_revision="",
                required_workers=0,
                available_workers=0,
            )
            state = state.model_copy(update={"work_packages": (*state.work_packages, package)})
            record_lifecycle_change(
                repo, state, principal, "WORK_PACKAGE_CREATED", {"work_package_id": package.id}
            )
        return package
