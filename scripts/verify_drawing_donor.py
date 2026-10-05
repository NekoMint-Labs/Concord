"""Verify pinned Drawing source hashes, unchanged helpers and recorded adaptations."""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VENDOR = ROOT / "frontend/vendor/opentakeoff"


def verify(source: Path) -> None:
    manifest = json.loads((VENDOR / "annotation-upstream.json").read_text(encoding="utf-8"))
    for relative, expected in manifest["sha256"].items():
        actual = hashlib.sha256((source / relative).read_bytes()).hexdigest()
        if actual != expected:
            raise ValueError(f"Unexpected upstream Drawing source: {relative}")
    for original, copied in [
        ("components/AnnotationWorkbench.css", "AnnotationWorkbench.css"),
        ("lib/annotationTools.js", "annotationTools.js"),
    ]:
        if (source / original).read_bytes() != (VENDOR / copied).read_bytes():
            raise ValueError(f"Unrecorded donor modification: {copied}")
    original = (source / "components/AnnotationWorkbench.jsx").read_text(encoding="utf-8")
    adapted = (VENDOR / "AnnotationWorkbench.jsx").read_text(encoding="utf-8")
    patch = "".join(difflib.unified_diff(
        original.splitlines(keepends=True), adapted.splitlines(keepends=True),
        fromfile="web/src/components/AnnotationWorkbench.jsx", tofile="AnnotationWorkbench.jsx",
    ))
    if patch != (VENDOR / "AnnotationWorkbench.patch").read_text(encoding="utf-8"):
        raise ValueError("Drawing source adaptation does not match its recorded patch")
    commands = (source / "lib/shapeCommands.js").read_text(encoding="utf-8")
    start = commands.index("export function recordCommand(")
    function = commands[start:commands.index("\n}", start) + 2]
    expected = ("// Extracted unchanged from OpenTakeoff web/src/lib/shapeCommands.js.\n"
                "const UNDO_CAP = 100;\n" + function + "\n")
    if (VENDOR / "recordCommand.js").read_text(encoding="utf-8") != expected:
        raise ValueError("Drawing history helper differs from the verified donor")
    print(f"Drawing donor verified: {manifest['revision']}; five hashes and recorded patch")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source", type=Path,
        default=ROOT / ".cache/engineering-viewers/opentakeoff-source/web/src",
    )
    verify(parser.parse_args().source)
