# Golden engineering coordination sources

Original synthetic test data authored specifically for Concord. There is no real project data, borrowed drawing/model, or redistributed font binary. These files are test sources, not construction instructions. The generator creates input geometry/documents; detector outcomes are computed by real engines in tests.

## Story and identities

| Step | Sources | Geometry |
| --- | --- | --- |
| R1 | Structural/architectural/MEP PDFs, structure/MEP IFC, specification, XLSX/CSV and IDS | BEAM-01 has 300 mm depth and clears DUCT-01. |
| R2 | Revised structural PDF/IFC/DXF; design-change DOCX and Chinese scanned notice | BEAM-01 deepens to 900 mm, intersects the unchanged R1 duct. |
| R3 | Revised MEP PDF/IFC | DUCT-01 moves laterally and clears the R2 structure. |

Stable GlobalIds:

- BEAM-01: `3M0KwyPFrBT9KwklhqZa8W`
- DUCT-01: `0wJm_7P3jD4uBWYGw9xyVx`

IFC lengths use metres. Naming IDS applicability is optional for each discipline: check the named beam or duct when present, without requiring both disciplines in a single IFC. Separate required-applicability regression tests verify missing required elements fail.

`manifest.json` records original source hashes. Engine-generated results, caches and measured timings do not belong in that manifest.

## Qualification

Install the locked BIM/document extras, then run:

```text
uv run --frozen --no-sync pytest -q backend/tests/test_golden_engineering.py backend/tests/test_engineering_adapters.py --junitxml=.verification-work/golden.xml
uv run --frozen --no-sync python scripts/assert_junit.py .verification-work/golden.xml
```

The IFC test writes measured parse/diff/clash timings to `golden-ifc-metrics.json` under pytest's temporary directory. It validates actual IFC syntax/geometry and checks the 0 → 1 → 0 intersection story, selected GlobalIds, revision provenance and real IfcDiff geometry changes. Workbook and DOCX tests use the real Docling converter.

Real offline PDF and Chinese PNG/scanned-PDF OCR are covered by `backend/tests/integration/test_engineering_documents.py`. Provision models explicitly with `scripts/prefetch_docling_models.py --with-rapidocr`, then set `DOCLING_ARTIFACTS_PATH` and `CCA_TEST_RAPIDOCR_ARTIFACTS` to the resulting artifact root. The tests block network connections during conversion.

Pending: PDF/CAD viewer diff, SDK viewer reopen, authoritative publication/re-check integration, cache reuse and resource cleanup. Passing the backend fixture tests does not establish these capabilities.

## Regeneration

Generator-only packages are ReportLab 4.4.10 and ezdxf 1.4.3, plus the locked BIM/document packages and their Office/Pillow dependencies. They are not additional application runtime dependencies.

```text
uv run --frozen --no-sync python scripts/generate_coordination_fixture.py --font <local-Chinese-font-path> --output <new-output-directory>
```

The Chinese scan needs a local Chinese-capable font; the generator does not copy the font. To reproduce its exact image bytes, use the same font file and library environment. All 17 source files were reproduced byte-for-byte locally with the same environment. Compare the generated manifest before replacing committed sources.
