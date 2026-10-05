"""Author deterministic standard BCF 3.0 viewpoints with the published BCF SDK."""

import zipfile
from pathlib import Path
from typing import cast

from golden_document_fixture import stable_archive
from golden_ifc_fixture import BEAM_GUID, DUCT_GUID


def viewpoints(folder: Path) -> None:
    from bcf.v3 import model as mdl
    from bcf.v3.bcfxml import BcfXml
    from bcf.v3.topic import TopicHandler
    from bcf.v3.visinfo import VisualizationInfoHandler
    from xsdata.models.datatype import XmlDateTime

    folder.mkdir(parents=True, exist_ok=True)
    for camera_kind in ("perspective", "orthogonal"):
        document = BcfXml.create_new("Golden coordination")
        project = document.project_info
        assert project is not None
        project.project.project_id = "11111111-1111-4111-8111-111111111111"
        topic_guid = "22222222-2222-4222-8222-222222222222"
        vp_guid = "33333333-3333-4333-8333-333333333333"
        original = document.add_topic(
            "Golden beam and duct review", "Technical viewer qualification", "golden@example.test"
        )
        markup = original.markup
        assert markup is not None
        markup.topic.guid = topic_guid
        markup.topic.creation_date = XmlDateTime.from_string("2026-10-02T00:00:00Z")
        topic = TopicHandler(cast(zipfile.Path, Path(topic_guid)))
        topic.markup = markup
        document.topics.clear()
        document.topics[topic_guid] = topic
        camera_values = {
            "camera_view_point": mdl.Point(x=3.0, y=-6.0, z=2.0),
            "camera_direction": mdl.Direction(x=0.0, y=1.0, z=0.0),
            "camera_up_vector": mdl.Direction(x=0.6, y=0.0, z=0.8),
            "aspect_ratio": 1.0,
        }
        visualization = mdl.VisualizationInfo(
            guid=vp_guid,
            components=mdl.Components(
                selection=mdl.ComponentSelection(
                    component=[mdl.Component(ifc_guid=g) for g in (BEAM_GUID, DUCT_GUID)]
                )
            ),
            clipping_planes=mdl.VisualizationInfoClippingPlanes(
                clipping_plane=[
                    mdl.ClippingPlane(
                        location=mdl.Point(x=0.0, y=0.0, z=3.0),
                        direction=mdl.Direction(x=0.0, y=0.0, z=1.0),
                    ),
                    mdl.ClippingPlane(
                        location=mdl.Point(x=-1.0, y=0.0, z=0.0),
                        direction=mdl.Direction(x=-1.0, y=0.0, z=0.0),
                    ),
                ]
            ),
        )
        if camera_kind == "perspective":
            visualization.perspective_camera = mdl.PerspectiveCamera(
                **camera_values, field_of_view=48.0
            )
        else:
            visualization.orthogonal_camera = mdl.OrthogonalCamera(
                **camera_values, view_to_world_scale=7.5
            )
        topic.add_visinfo_handler(VisualizationInfoHandler(visualization))
        topic.comments = [
            mdl.Comment(
                guid="44444444-4444-4444-8444-444444444444",
                date=XmlDateTime.from_string("2026-10-02T00:00:00Z"),
                author="golden@example.test",
                comment="Check beam and duct together.",
                viewpoint=mdl.CommentViewpoint(guid=vp_guid),
            )
        ]
        output = folder / f"{camera_kind}.bcfzip"
        try:
            document.save(output)
        finally:
            document.close()
        stable_archive(output)


if __name__ == "__main__":
    viewpoints(Path(__file__).resolve().parents[1] / "fixtures/coordination-project/viewpoints")
