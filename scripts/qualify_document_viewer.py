"""Produce ignored real Docling evidence for browser qualification; no mocked outcomes."""

import argparse
import hashlib
import json
from pathlib import Path

from app.adapters.documents_docling import DoclingDocumentParser

parser = argparse.ArgumentParser(__doc__)
parser.add_argument("--output", type=Path, required=True)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
root = Path(__file__).resolve().parents[1] / "fixtures/coordination-project"
engine = DoclingDocumentParser()
for source in ("R1/coordination-log.xlsx", "R2/design-change-023.docx"):
    original = root / source
    content = original.read_bytes()
    chunks = engine.parse(content, original.name)
    result = {
        "sourceRevisionId": "Golden-" + source,
        "sourceHash": hashlib.sha256(content).hexdigest(),
        "filename": original.name,
        "chunks": [chunk.model_dump(mode="json") for chunk in chunks],
    }
    (args.output / (original.suffix.removeprefix(".") + ".json")).write_text(
        json.dumps(result, ensure_ascii=False), encoding="utf-8"
    )
print("Real Docling document viewer sources ready")
