# BIM, Documents, and Optimization

## BIM backend

### StructuredBIMProvider — Required Default

Provide a small deterministic structured BIM representation for stable local/demo flows. It should expose the same domain semantics as the real IFC adapter: elements, type/category, space/floor, relevant properties, ids, and relations needed by coordination logic.

### IfcOpenShellBIMProvider — Required

Implement real IFC reading/query capability behind `BIMProvider` using IfcOpenShell. At minimum support:

- open/load IFC;
- stable element/global ids;
- element type/properties;
- spatial containment/storey/space relationships;
- relationship queries needed for impact analysis;
- project/file revision/hash metadata;
- targeted queries by id/type/location/property;
- safe failure for malformed/unsupported IFC.

Use existing IfcOpenShell utilities (e.g. query/diff/test-related capabilities) where they provide value; do not write a new IFC parser/query language.

Geometry-heavy operations should be isolated/on-demand and never make normal app startup expensive.

## BIM viewer — Required

The former single-viewer donor mandate is retired. Current product/viewer seams
are `docs/PRODUCT_WORKFLOW.md` and `docs/EVIDENCE_VIEWER_ADAPTERS.md`. C owns SDK
lifecycles; B owns composition. Retained behavior constraints:

- load an appropriate BIM representation/file;
- select/highlight elements;
- focus/isolate relevant elements/workface where supported;
- show element properties/ids;
- receive impacted element ids from application state;
- avoid rendering the entire project graph as UI nodes.

Backend BIM truth and frontend render objects remain separate concerns.

## Documents

### Lightweight parser — Required

Provide a low-dependency path for plain text/Markdown/simple text-bearing documents needed by the local demo.

### DoclingDocumentParser — Required

Use Docling for complex construction documents. Normalize supported PDF/Office/image/HTML/Markdown inputs into project-owned document/chunk/evidence structures. Preserve file hash/revision, page/location metadata, and parser provenance.

Docling can run locally; do not require cloud upload for parsing.

### Search

Document search uses structured metadata/revision filters first, FTS second, semantic retrieval as an optional enhancement. Never embed everything merely because a vector path exists.

## Optimization

### SimpleResolver — Required Default

Explainable deterministic rules for small conflicts: precedence, basic availability, simple resource/workspace conflict, qualifications, and prioritization.

### ORToolsResolver — Required

Use Google OR-Tools CP-SAT/scheduling patterns for real multi-constraint problems. Model at least one tested fixture with:

- multiple tasks/work packages;
- crews/workers;
- equipment/resource capacity;
- qualifications;
- precedence;
- time windows;
- at least one objective such as minimizing delay/makespan/waiting/cost proxy.

Map domain inputs to solver variables/constraints through the adapter. Return project-owned resolution results with objective/explanation metadata. Do not expose solver types to Domain/Application.

## Selection policy

Default to SimpleResolver for small/explainable cases. Invoke OR-Tools when problem complexity/explicit request warrants it. The selection rule is deterministic/configurable and observable.

## Official references to consult during implementation

- IfcOpenShell official docs/repository
- That Open docs: https://docs.thatopen.com/
- Docling docs: https://docling-project.github.io/docling/
- OR-Tools official scheduling/CP-SAT examples

Check current APIs/licenses at implementation time.
