"""BCF camera/topic/comment mapping confined to the optional SDK boundary."""

from math import isfinite
from pathlib import Path
from typing import TYPE_CHECKING, cast
from uuid import UUID, uuid4

from app.adapters.engineering_results import BCFClippingPlane, BCFComment, BCFViewpoint
from app.domain.errors import DomainError, ProviderError

if TYPE_CHECKING:
    from bcf.v2.bcfxml import BcfXml
    from bcf.v2.topic import TopicHandler
    from bcf.v2.visinfo import VisualizationInfoHandler


def write_viewpoint(document: "BcfXml", viewpoint: BCFViewpoint) -> None:
    import zipfile

    import bcf.v2.model as mdl
    from bcf.v2.topic import TopicHandler
    from bcf.v2.visinfo import VisualizationInfoHandler, build_components
    from xsdata.models.datatype import XmlDateTime

    position, direction, up = validate_camera(viewpoint)
    topic = document.add_topic(
        viewpoint.title,
        viewpoint.description or "Engineering viewpoint exported from Concord",
        "Concord",
        topic_type=viewpoint.topic_type,
        topic_status=viewpoint.topic_status,
    )
    if viewpoint.topic_guid:
        document.topics.pop(topic.guid)
        markup = topic.markup
        assert markup is not None
        markup.topic.guid = str(viewpoint.topic_guid)
        # Like the SDK create_new(), new topics use pathlib paths.
        topic = TopicHandler(topic_dir=cast(zipfile.Path, Path(str(viewpoint.topic_guid))))
        topic.markup = markup
        document.topics[topic.guid] = topic
    camera_values = {
        "camera_view_point": mdl.Point(x=position[0], y=position[1], z=position[2]),
        "camera_direction": mdl.Direction(x=direction[0], y=direction[1], z=direction[2]),
        "camera_up_vector": mdl.Direction(x=up[0], y=up[1], z=up[2]),
    }
    visualization = mdl.VisualizationInfo(
        guid=str(viewpoint.viewpoint_guid or uuid4()),
        components=build_components(*viewpoint.selected_global_ids),
    )
    if viewpoint.camera_kind == "orthogonal":
        visualization.orthogonal_camera = mdl.OrthogonalCamera(
            **camera_values, view_to_world_scale=viewpoint.view_to_world_scale
        )
    else:
        visualization.perspective_camera = mdl.PerspectiveCamera(
            **camera_values, field_of_view=viewpoint.field_of_view
        )
    if viewpoint.clipping_planes:
        visualization.clipping_planes = mdl.VisualizationInfoClippingPlanes(
            clipping_plane=[
                mdl.ClippingPlane(
                    location=mdl.Point(
                        x=plane.location[0], y=plane.location[1], z=plane.location[2]
                    ),
                    direction=mdl.Direction(
                        x=plane.direction[0], y=plane.direction[1], z=plane.direction[2]
                    ),
                )
                for plane in viewpoint.clipping_planes
            ]
        )
    handler = VisualizationInfoHandler(visualization, snapshot=viewpoint.snapshot_png)
    topic.add_visinfo_handler(
        handler,
        snapshot_filename="snapshot.png" if viewpoint.snapshot_png else None,
    )
    topic.comments = [
        mdl.Comment(
            guid=str(comment.guid),
            author=comment.author,
            date=XmlDateTime.from_datetime(comment.date),
            comment=comment.text,
            viewpoint=(
                mdl.CommentViewpoint(guid=str(comment.viewpoint_guid))
                if comment.viewpoint_guid
                else None
            ),
            modified_author=comment.modified_author,
            modified_date=(
                XmlDateTime.from_datetime(comment.modified_date) if comment.modified_date else None
            ),
        )
        for comment in viewpoint.comments
    ]


def read_viewpoint(
    topic: "TopicHandler",
    handler: "VisualizationInfoHandler",
    source_id: str,
    source_revision_id: str,
) -> BCFViewpoint:
    visualization = handler.visualization_info
    orthogonal = visualization.orthogonal_camera
    camera = orthogonal or visualization.perspective_camera
    if camera is None:
        raise ProviderError("BCF viewpoint has no camera")
    return BCFViewpoint(
        source_id=source_id,
        source_revision_id=source_revision_id,
        title=topic.topic.title,
        topic_guid=UUID(topic.topic.guid),
        viewpoint_guid=UUID(visualization.guid),
        comments=tuple(
            BCFComment(
                guid=UUID(comment.guid),
                author=comment.author,
                date=comment.date.to_datetime(),
                text=comment.comment,
                viewpoint_guid=(UUID(comment.viewpoint.guid) if comment.viewpoint else None),
                modified_author=comment.modified_author,
                modified_date=(
                    comment.modified_date.to_datetime() if comment.modified_date else None
                ),
            )
            for comment in topic.comments
        ),
        description=topic.topic.description,
        topic_type=topic.topic.topic_type or "Engineering",
        topic_status=topic.topic.topic_status or "Open",
        selected_global_ids=_selected_global_ids(visualization),
        clipping_planes=tuple(
            BCFClippingPlane(
                location=_vector(plane, "location"), direction=_vector(plane, "direction")
            )
            for plane in (
                visualization.clipping_planes.clipping_plane
                if visualization.clipping_planes
                else []
            )
        ),
        position=_vector(camera, "camera_view_point"),
        direction=_vector(camera, "camera_direction"),
        up=_vector(camera, "camera_up_vector"),
        snapshot_png=handler.snapshot,
        camera_kind="orthogonal" if orthogonal else "perspective",
        field_of_view=getattr(camera, "field_of_view", 60.0),
        view_to_world_scale=getattr(camera, "view_to_world_scale", 1.0),
    )


def _finite_vector(value: tuple[float, float, float]) -> tuple[float, float, float]:
    if not all(isfinite(axis) for axis in value):
        raise DomainError("BCF camera coordinates must be finite")
    return value


def _vector(value, name: str) -> tuple[float, float, float]:
    item = getattr(value, name)
    return _finite_vector((float(item.x), float(item.y), float(item.z)))


def _selected_global_ids(visualization) -> tuple[str, ...]:
    components = visualization.components
    selection = components.selection if components else None
    return (
        tuple(component.ifc_guid for component in selection.component if component.ifc_guid)
        if selection
        else ()
    )


def validate_camera(viewpoint: BCFViewpoint):
    if viewpoint.position is None:
        raise DomainError("BCF viewpoint requires a camera position")
    position = _finite_vector(viewpoint.position)
    direction = _finite_vector(viewpoint.direction or (0.0, 0.0, -1.0))
    up = _finite_vector(viewpoint.up or (0.0, 1.0, 0.0))
    if sum(v * v for v in direction) == 0 or sum(v * v for v in up) == 0:
        raise DomainError("BCF camera direction and up vectors must be nonzero")
    cross = (
        direction[1] * up[2] - direction[2] * up[1],
        direction[2] * up[0] - direction[0] * up[2],
        direction[0] * up[1] - direction[1] * up[0],
    )
    if sum(v * v for v in cross) < 1e-12:
        raise DomainError("BCF camera direction and up vectors must not be parallel")
    if len(viewpoint.clipping_planes) > 32 or len(viewpoint.selected_global_ids) > 10000:
        raise DomainError("BCF viewpoint exceeds the clipping/selection limit")
    for plane in viewpoint.clipping_planes:
        _finite_vector(plane.location)
        normal = _finite_vector(plane.direction)
        if sum(axis * axis for axis in normal) == 0:
            raise DomainError("BCF clipping plane direction must be nonzero")
    return position, direction, up
