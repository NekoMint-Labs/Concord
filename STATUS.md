# Project status

## Current local boundary

This dirty `feat/16-product-workspace` worktree is **not an accepted baseline**.
Visual work is stopped. This pass changes B-owned integration glue, regression
checks and documentation; no C viewer implementation is copied or modified.
[PRODUCT_WORKFLOW](docs/PRODUCT_WORKFLOW.md) describes behavior derived from the
current B source, including the OpenTakeoff shell and one Work list/receipt.

B's `EvidenceWorkspaceHost` now composes four lazy C surfaces (Drawing, CAD, IFC,
Document). Their modules/assets/dependencies remain a **merge/rebase dependency**
from PR22, not present in this B viewer tree. The inspected comparison trees were:

- actual main: `/tmp/concord-seam-pass/main`,
  `4124fc8d98a8d94abe8af33ea7d204452db16cf4` (merged #20);
- PR22 C: `/tmp/concord-seam-pass/c`,
  `9feb7120707e127a6f5280eaed453e2c7d2d099f`.

Git fetch and GitHub PR metadata verified these heads: #19/#20 merged, #22 open.
#21 was not integrated. A detached local A+B+C source rehearsal exists at
`/tmp/concord-seam-pass/full`; it is not an accepted product baseline.
PR22's adapter-local evidence does not establish product/runtime acceptance.
Current IFC preparation is blocked by an archive hash mismatch (expected `cd2c89…`,
actual `95f5e8…`); see [VERIFICATION](VERIFICATION.md). Full integrated acceptance is not established. Focused seam tests passed; final
fast gates and unexecuted browser/native gates are recorded in VERIFICATION. Do not claim issues
#16/#17 complete, native acceptance for this worktree, or production release readiness.

## Historical verified main

The inspected main snapshot retains the established maintainability baseline's
recorded full source/integration CI and Windows native qualification, including
manual installer/startup, packaged Python sidecar/DBOS, coordination demo and
restart acceptance. These are **historical main evidence**, not verification of
this dirty B shell or PR22 composition. Details and reproduction commands remain
in [VERIFICATION](VERIFICATION.md) and [AGENT_INTEGRATION](docs/AGENT_INTEGRATION.md).

## Remaining qualification

Complete dependency integration and resolve the IFC preparation failure through
owner review before integrated qualification. Real-engine/persisted product
journeys, viewer failure/cleanup and applicable native packaging require fresh
evidence. Linux/macOS native qualification, signing/notarization and final
production release remain separate work. [TEAM_DEVELOPMENT](TEAM_DEVELOPMENT.md)
owns review boundaries; [DOCUMENTATION_AUDIT](docs/DOCUMENTATION_AUDIT.md) records
retired UI directions and retained durable contracts.

Final fast checkpoint: integrated typecheck/build/lint passed, Vitest 86 files /
628 tests passed and transport 43/43 passed. A single type-only test correction
was narrowly rerun successfully. Browser/native product acceptance remains
unexecuted at the user’s expedited-stop request; do not open an acceptance PR on
this evidence alone. See VERIFICATION and docs/DOCUMENTATION_AUDIT.md.
