# Isolated IFC Viewer Online integration

Upstream: j03rul4nd/ifc-viewer-online
Revision: 5073adf1f5fadef76129460555482b6507c2be74
License: MIT
Original package-lock SHA-256: cd7223b245b36d2e0534bbed4499185e94647ae56463ec95632f8dd105db7ea0

Run from the Concord repository root:

```text
python frontend/viewer-integrations/ifc/prepare.py
pnpm --dir frontend exec playwright test --config playwright.engineering.config.ts tests/ifc/ifc.spec.ts
```

The preparation script fetches exactly the pinned Git revision, verifies its Git
archive and npm lock hashes, safely extracts the source, applies eleven focused
patches and native fragment-index/tree-cache/BCF overlays, installs the original locked dependencies,
and builds the independent application. Runtime assets are copied to ignored
frontend/public/viewer/ifc. Build output, dependency trees and the source archive
are never committed. An existing unadapted or stale prepared source directory is rejected using a
fingerprint of every recorded patch and overlay.
--publish-only copies an already built adapted tree locally; it does not upload
or publish a release.

Adaptations:

- The standalone SDK rejects messages from a different origin. The embedded
  application accepts commands only from its same-origin parent.
- SDK and app delegate GlobalId lookup to the native fragment index. Unknown
  models/GlobalIds fail. IFCItemData reads the fragment SDK's _guid field when
  GlobalId is not duplicated in the ordinary attributes.
- Fragments workers and web-ifc WASM are local. Telemetry, auth and optional
  scene extensions are disabled in the isolated build environment. The embed
  does not register a service worker or load the donor site's font stylesheet.
- Full-byte SDK sources key geometry by donor revision, dependency-lock hash,
  full SHA-256 fingerprint and `fragment-index-v2` adaptation semantics. The
  derived spatial tree/decomposition map is cached separately in bounded OPFS
  entries (four entries, at most 16 MiB each). Cold indexing reuses the donor
  fragment hierarchy/metadata/relationships and existing ModelTree, without
  starting a second source-parser worker. Class names and physical-element
  inheritance come from the installed IFC schema definitions; no WASM parser is
  constructed for that lookup. Uncontained elements are explicitly grouped,
  including elements without geometry. Native metadata failures remain explicit;
  storage failure rebuilds from fragments and remains measurable.
- The BCF adapter uses the donor XML parser/writer and coordinate mapping,
  native multi-model selection, camera-controls and section system. Narrow
  changes retain perspective/orthogonal optics and bound ZIP expansion. Host
  parsing requests require a version manifest; legacy donor parsing retains its
  existing fallback. Request workers terminate on completion, error or exit.
- Concord owns source selection. The donor toolbar is suppressed while its
  properties, scene, measurement, section and plans panels remain available.

C's IfcSurface and IfcModelAdapter retain source revision/hash bindings, stable
selection and navigation, local capability failure, and disposal. No donor types
are exported into A's domain or B's public surface. The product App is unchanged.

Qualified: real Golden IFC rendering, stable GlobalId target and selection,
section/measurement activation, PNG capture, unknown target rejection, fragment
and spatial-tree reuse on reopening, and worker termination after iframe exit.
BCF 3.0 export and 2.1/3.0 viewpoint reopening are isolated, revision/hash-scoped
operations. No topic status becomes Concord coordination state. Real Golden
perspective/orthogonal viewpoints verify camera roll, two-model selection,
clipping and snapshots across close/reopen. Exported files are read independently
by the published BCF SDK. This is technical per-viewpoint exchange, not complete
preservation of visibility, coloring, attachments or extensions.

The extra ModelTree source parse is removed. The fragment importer still owns
its internal geometry/property passes; one total source parse is not claimed.
Large-model/GPU pressure behavior,
A's persistent ViewerTarget seam and native packaging remain acceptance work.

Focused independent donor qualification (after preparing the source):

```text
node node_modules/vitest/vitest.mjs run src/lib/bcf.test.ts src/lib/concord-bcf.test.ts src/lib/concord-fragment-index.test.ts src/lib/concord-build-index.test.ts
```

Run this command inside the cached adapted donor directory. Concord's root
Vitest excludes independent viewer trees, which have their own locked SDKs.
The browser BCF interoperability checks require Concord's locked BIM Python
extra in .venv. Generated exports remain under ignored .verification-work.
