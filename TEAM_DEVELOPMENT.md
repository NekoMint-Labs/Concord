# Team ownership and change boundaries

This is a lightweight navigation and review guide, not a replacement for
durable constraints in `specifications/`. Start with its index, then read only
what is relevant. [PRODUCT_WORKFLOW](docs/PRODUCT_WORKFLOW.md) owns current product
behavior; retired UI prompts are not implementation authority. [STATUS](STATUS.md)
and [VERIFICATION](VERIFICATION.md) separate historical main qualification from
this unaccepted local integration.

## Primary ownership

Ownership means primary implementation and review responsibility, not exclusive
permission.

### Developer A — Platform / Desktop / Reliability

**Primary responsibility:** backend runtime; DBOS / Temporal; persistence and
transactions; backend lifecycle APIs; approval / action safety; Desktop / Tauri;
packaged sidecar lifecycle; storage; recovery; release and reliability tooling.

Normal boundaries include `desktop/`, persistence/runtime adapters and migrations,
`backend/app/application/actions.py`, `capability_jobs.py`, and backend run/action/event
API modules.

### Developer B — Product / Web / UX

**Primary responsibility:** frontend application composition; workspace/navigation;
WorkPanel/FindingWorkbench/Evidence host; Operations; Impact / Inspector / run detail;
product interaction; visual consistency;
accessibility; demo UX.

Normal boundaries include `frontend/src/App.tsx`, `frontend/src/app/`, product features
except Documents, product components, and feature/shell styles.

### Developer C — BIM / Documents / Engineering Data

**Primary responsibility:** IFC / BIM; GIS; Documents; retrieval / embeddings; OR-Tools;
engineering providers; engineering fixtures; demo datasets.

Normal boundaries include `frontend/src/viewers/`, C's isolated viewer integrations
and vendor adaptations, the Documents feature and styles, engineering adapters and
fixtures. PR22's Drawing/CAD/IFC/Document surfaces are pending local dependencies of
B's current host. B consumes canonical targets and C's callbacks; C owns native
navigation/geometry/SDK disposal. See [the viewer seam](docs/EVIDENCE_VIEWER_ADAPTERS.md).

## GitHub workflow

```text
Issue
→ assign owner
→ create short-lived issue branch from latest main
→ implementation
→ focused local verification
→ Draft PR
→ self-review
→ Ready for review
→ peer review
→ CI
→ squash merge
→ close Issue
```

Use one Issue for normal feature and bug work. Branch from the latest `main` and use:

- `feat/<issue-number>-short-name`
- `fix/<issue-number>-short-name`
- `chore/<issue-number>-short-name`

Do not use long-lived personal branches such as `dev-a`, `dev-b`, or `dev-c`. `main` is
not for direct feature development; integration happens by pull request only.

## Parallel development

> **Parallel inside modules; coordinate briefly at shared contracts.**

Independent work may proceed concurrently inside each owner's normal module boundary.
For weak dependencies, use separate Issues rather than one oversized PR. For example:

```text
#41 [Platform] Add project creation API
#42 [Web] Add New Project UX

#42 declares: Depends on #41
```

Do not combine separate owner responsibilities into one oversized PR only because they
contribute to one user-facing feature.

Coordinate before changing these shared seams:

- `frontend/src/App.tsx`
- `frontend/src/app/WorkspaceViews.tsx`
- `frontend/src/app/EvidenceWorkspaceHost.tsx` and C's surface input/error contracts
- `backend/app/bootstrap.py`
- `backend/app/domain/**`
- `backend/app/ports/**`
- backend API schemas/routes
- `frontend/src/api/client.ts`
- `frontend/openapi.json`
- `frontend/src/api/schema.ts`
- database schema/migrations
- dependency manifests and lockfiles
- `.github/workflows/**`

Only one active change owner should modify the same shared contract/seam at a time. For
a shared contract change:

```text
contract PR → merge to main → dependent feature branches update from main → parallel work continues
```

Generated OpenAPI/schema files are generator-owned: regenerate them with the locked
commands and never hand-edit them.

## Module guidance

- In `frontend/src/app/`, `useWorkspace` owns query keys, polling, and the
  approval-owner stream. `useWorkspaceMutation` owns serialization and cache
  reconciliation. The root retains project/package/constraint selection and event
  orchestration; do not add a global store for a panel.
- Existing BIM/GIS views retain their lifecycle hooks: `useIFCViewer` owns the
  existing SDK lifetime and `useBIMSource` owns source/import/reopen fencing. They
  are not PR22's new `IfcSurface` runtime. The Evidence host lazily composes C's
  four surfaces; keep SDK types and geometry out of B and generated domain DTOs.
  Missing assets/targets or `onError(null)` must not be presented as successful navigation.
- In the backend, `capability_work.py` prepares drafts outside a project write
  transaction; `capability_jobs.py` coordinates run fencing and publication. Do not move
  slow SDK/model work under the write lock or publish from preparation.
- `SQLCoordinationRepository` combines project/evidence methods with `RunRecords` and
  `ActionRecords`. All record groups use the same `SessionRecords.session`; only the
  repository factory opens, commits, and rolls back the transaction.
- `backend/app/api/runs.py` composes run, SSE, and action route modules. Policy and
effects remain in application services. `bootstrap.py` is the composition root;
capability construction receives its startup `ExitStack` for cleanup.
- `frontend/src/styles.css` is the single import entry. Pinned B OpenTakeoff CSS
  under `src/vendor/opentakeoff/` owns shell/chrome/Work presentation; `base.css`
  bridges existing tokens. Remaining ThatOpen panels/tables/toolbars/viewport are
  components, not an alternative shell. Feature sheets retain their selectors.
  Preserve donor provenance, responsive behavior and cascade order; do not edit
  verbatim donor copies casually. C's Drawing donor has separate provenance.

## PR and review policy

Normal PRs require one peer approval, applicable CI green, and resolved review
conversations. For high-risk shared seam changes, request review from both other
developers when appropriate.

Required domain review:

- Product/UI behavior → Developer B
- Runtime/persistence/DB/action safety → Developer A
- BIM/documents/engineering data → Developer C

Review focuses on:

1. Does the PR satisfy the Issue acceptance criteria?
2. Does it preserve architecture and safety invariants?
3. Is verification sufficient?
4. Does it contain unrelated changes?
5. Does it unnecessarily expand coupling/shared seams?

Formatting and style belong to automated tools, not review discussion. Keep PRs focused
on one acceptance goal. A PR may span the files/modules needed for one coherent outcome,
but must not include unrelated cleanup or refactors. Use short-lived branches and GitHub
squash merge.

## Definition of Done

- Issue acceptance criteria satisfied
- no unrelated cleanup
- relevant tests/checks passed locally where available
- generated artifacts correctly regenerated when required
- required documentation updated
- author completed self-review
- peer approval obtained
- CI passed
- review conversations resolved
- squash merged into `main`

Area-specific expectations:

- **Web:** typecheck; relevant Vitest; build; lint; screenshots for meaningful UI
  changes.
- **Backend:** relevant pytest; API contract generation/check when applicable.
- **BIM/Documents:** relevant provider/capability tests; real IFC/Docling qualification
  when behavior requires it.
- **Desktop/runtime:** focused runtime tests; Windows native workflow when native
  behavior changes.

Do not require expensive native or integration workflows for unrelated trivial changes.
