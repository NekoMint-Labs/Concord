"""Author permanent Golden Engineering sources; never generate detector outcomes.

Authoring-only packages: reportlab 4.4.10, ezdxf 1.4.3, and the locked documents/BIM
extras. Use --font with a local Chinese font; font binaries are not redistributed.
"""

import argparse
import hashlib
import json
from pathlib import Path

from golden_document_fixture import (
    change_document,
    drawing,
    dxf,
    requirements_ids,
    scanned_notice,
    specification,
    workbook,
)
from golden_ifc_fixture import BEAM_GUID, DUCT_GUID, create_model


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "fixtures/coordination-project",
    )
    parser.add_argument("--font", type=Path, required=True)
    args = parser.parse_args()
    folder = args.output
    for revision in ("R1", "R2", "R3"):
        (folder / revision).mkdir(parents=True, exist_ok=True)
    for discipline in ("architectural", "structural", "mep"):
        drawing(folder / "R1" / f"{discipline}-drawing.pdf", discipline, "R1")
    drawing(folder / "R2/structural-drawing.pdf", "structural", "R2")
    drawing(folder / "R3/mep-drawing.pdf", "mep", "R3")
    for revision, discipline in (
        ("R1", "structure"),
        ("R1", "mep"),
        ("R2", "structure"),
        ("R3", "mep"),
    ):
        create_model(folder / revision / f"{discipline}.ifc", discipline, revision)
    specification(folder / "R1/specification.pdf")
    requirements_ids(folder / "R1/requirements.ids")
    workbook(folder / "R1/coordination-log.xlsx")
    change_document(folder / "R2/design-change-023.docx")
    scanned_notice(folder / "R2/design-change-023-scan.png", args.font)
    dxf(folder / "R1/structural-drawing.dxf", "R1")
    dxf(folder / "R2/structural-drawing.dxf", "R2")
    (folder / "R1/coordination-log.csv").write_text(
        "Element,Design change,Status\n"
        "BEAM-01,023,Beam enlarged\n"
        "DUCT-01,023,Route requires review\n",
        encoding="utf-8",
    )
    hashes = {
        p.relative_to(folder).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in sorted(folder.rglob("*"))
        if p.is_file() and p.name != "manifest.json" and p.suffix not in {".md"}
    }
    (folder / "manifest.json").write_text(
        json.dumps(
            {
                "synthetic": True,
                "global_ids": {"beam": BEAM_GUID, "duct": DUCT_GUID},
                "sha256": hashes,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(json.dumps({"output": str(folder), "files": len(hashes)}))


if __name__ == "__main__":
    main()
