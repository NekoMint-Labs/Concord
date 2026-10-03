"""Independently verify browser BCF output with the pinned IfcOpenShell BCF SDK."""

import argparse
from pathlib import Path

from bcf.v3.bcfxml import BcfXml

parser = argparse.ArgumentParser(__doc__)
parser.add_argument("archive", type=Path)
parser.add_argument("camera", choices=["perspective", "orthogonal"])
args = parser.parse_args()
document = BcfXml.load(args.archive)
assert document is not None
try:
    assert document.version.version_id == "3.0"
    assert len(document.topics) == 1
    topic = next(iter(document.topics.values()))
    assert len(topic.viewpoints) == 1
    handler = next(iter(topic.viewpoints.values()))
    visual = handler.visualization_info
    assert visual.components is not None and visual.components.selection is not None
    assert {item.ifc_guid for item in visual.components.selection.component} == {
        "3M0KwyPFrBT9KwklhqZa8W",
        "0wJm_7P3jD4uBWYGw9xyVx",
    }
    assert handler.snapshot is not None and handler.snapshot.startswith(b"\x89PNG\r\n\x1a\n")
    camera = visual.orthogonal_camera if args.camera == "orthogonal" else visual.perspective_camera
    assert camera is not None
    assert abs(camera.camera_view_point.x - 3) < 1e-5
    assert abs(camera.camera_view_point.y + 6) < 1e-5
    assert abs(camera.camera_view_point.z - 2) < 1e-5
    assert abs(camera.camera_up_vector.x - 0.6) < 1e-5
    assert abs(camera.camera_up_vector.y) < 1e-5
    assert abs(camera.camera_up_vector.z - 0.8) < 1e-5
    if args.camera == "orthogonal":
        assert visual.orthogonal_camera is not None
        assert abs(visual.orthogonal_camera.view_to_world_scale - 7.5) < 1e-5
    else:
        assert visual.perspective_camera is not None
        assert abs(visual.perspective_camera.field_of_view - 48) < 1e-5
    assert visual.clipping_planes is not None
    assert len(visual.clipping_planes.clipping_plane) == 2
    for plane in visual.clipping_planes.clipping_plane:
        p, n = plane.location, plane.direction
        if abs(n.z - 1) < 1e-5:
            assert abs(p.z - 3) < 1e-5
        else:
            assert abs(n.x + 1) < 1e-5 and abs(p.x + 1) < 1e-5
finally:
    document.close()
print("BCF SDK interoperability passed")
