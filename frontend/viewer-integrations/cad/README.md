# Isolated mlightcad integration

Pinned donor: `mlightcad/cad-viewer` at
`250533a861e9fa1feca739b6783286ed4e91674a`, MIT; packages 1.7.3.
Data-model 1.15.1 and Three 0.172.0 are independently locked here to match the
donor. They do not replace Concord's existing Three/IFC runtime.

`vendor/` contains upstream cad-diff-viewer sources and LICENSE. The only
viewer changes are DXF-only picker/extension guards, awaiting the donor
comparison in a dedicated worker and enabling the native entity selection. No CAD renderer or CAD diff is rebuilt.

Concord's wrapper validates the source hash/revision and registers its bytes
against the donor database. The worker uses the SDK's DXF parser and the
unchanged donor compare module, with hash/version-qualified reuse during the
viewer lifetime. Entity navigation resolves the revision/hash and actual SDK
handle, activates the matching comparison side, selects and frames native
geometric extents. Missing or stale targets fail explicitly. Disposal terminates the worker and destroys the SDK manager.

No LibreDWG/proprietary DWG converter is installed or registered. This path
does not accept DWG/RVT/NWD/NWC or publish native artifacts. A's authoritative
source upload path remains a separate integration dependency.

Limits: donor comparison covers top-level model-space entities; it does not
prove equivalent nested block/layout contents or effective layer attributes.
Font files must be legally supplied locally; missing font quality must remain
explicit. No remote font repository should be contacted.

Install using pinned pnpm, frozen mode after the first resolution. Build runs
into ignored `frontend/public/viewer/cad/`. B will consume the C-owned adapter
after shared ViewerTarget contracts land. No product composition changes here.
