"""Observe the pinned SDK geometry insertion without reparsing or replacing clash logic."""

from typing import Any, cast


class GeometryRecorder:
    """Forward each shape to the real tree and retain only usable GlobalIds."""

    def __init__(self, tree):
        self.tree = tree
        self.global_ids: set[str] = set()

    def add_element(self, shape):
        self.tree.add_element(shape)
        geometry = shape.geometry
        if geometry.verts and geometry.faces and shape.guid:
            self.global_ids.add(shape.guid)


def qualified_clasher(settings):
    # Import only when the optional engine is actually invoked.
    from ifcclash.ifcclash import Clasher

    class QualifiedClasher(Clasher):
        def __init__(self, settings):
            super().__init__(settings)
            self.checked_global_ids: dict[str, set[str]] = {}

        def add_collision_objects(self, name, ifc_file, source):
            tree = self.tree
            recorder = GeometryRecorder(tree)
            # The 0.8.5 SDK uses only add_element during this call. Restore the
            # native tree before its unchanged collision routines execute.
            self.tree = cast(Any, recorder)
            try:
                super().add_collision_objects(name, ifc_file, source)
            finally:
                self.tree = tree
            self.checked_global_ids.setdefault(name, set()).update(recorder.global_ids)

    return QualifiedClasher(settings)
