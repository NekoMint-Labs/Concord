# Product workflow

This is the authoritative description of **current product behavior**, derived from
B's working source, not a new UI plan or acceptance report. Durable backend rules
remain in `specifications/`; exact API fields come from generated contracts.
[STATUS](../STATUS.md) owns integration state and [VERIFICATION](../VERIFICATION.md)
owns qualification boundaries. Retired UI documents do not override this page.

## Enter and navigate

[App](../frontend/src/App.tsx) composes one project-keyed application. The
[project lifecycle hook](../frontend/src/app/useProjectLifecycle.ts) reconciles
remembered/recent projects with the server catalog; absent a real project, startup
offers creation/opening or an explicit demo choice. New projects open Project;
existing projects open Work. Switching projects remounts transient interactions.
Remembered project/package IDs and layout preferences are conveniences, not facts.

- **Work / 工作与审核:** review persisted Findings and project work in one docked list.
- **Project / 项目资料:** structure, sources, immutable revisions, imports and explicit
  baseline acceptance. Upload means `STORED`, not parsed or accepted.
- **Browse / 检索浏览:** browse project objects; Finding/Evidence links return to Work
  with their opaque IDs. Command search uses these objects, not a second workspace.
- Model, documents, change/issue detail, history and work-package coordination remain
  contextual surfaces; activity/runs, GIS and capability diagnostics are secondary.

[WorkspaceViews](../frontend/src/app/WorkspaceViews.tsx) composes non-Work views;
App mounts Work beside the rail/navigator in the donor canvas workspace. The shell,
chrome, docking, focus and Work list use the pinned OpenTakeoff B donor, not a
parallel ThatOpen shell. [Donor provenance](UI_DONOR_MIGRATION_MAP.md) and
[notices](../THIRD_PARTY_NOTICES.md) distinguish remaining ThatOpen components and
C's separate Drawing donor. Layout/focus are local chrome preferences only.

## Review a Finding

[WorkPanel](../frontend/src/features/WorkPanel.tsx) owns one query/filter/list and
one selected row/receipt across Findings and project work. It initially shows 50
matching rows and can reveal more. `needs` includes PROPOSED and CONFIRMED Findings;
`done` includes only CLOSED and DISMISSED Findings. CONFIRMED is still open;
DISMISSED is a human disposition, not an engineering resolution.
[FindingWorkbench](../frontend/src/features/FindingWorkbench.tsx) binds the selected
Finding session and its Evidence host; it does not add a second queue or inspector.

The receipt shows what changed, why it matters, suggested action/discipline,
limitations and dependencies. Evidence quality remains explicit:

- `structured`: engineering-verified facts;
- `extracted`: source content, not verified geometry or satisfied conditions;
- `inferred`: interpretation, not verified engineering truth.

Human controls follow the server state: confirm PROPOSED; edit/dismiss PROPOSED or
CONFIRMED; close CONFIRMED; reopen CLOSED or DISMISSED to PROPOSED. Edits expose title
and suggested action, not discipline. **Evidence insufficient** explains a contract
gap and submits nothing. Suggestions and Agent explanations never become human
Coordination, saved engineering Evidence or closure authority.

[useEngineeringFindings](../frontend/src/features/useEngineeringFindings.ts) uses
project/Finding/Evidence-scoped Query keys, serializes writes and reconciles server
records after success or rejection. It does not optimistically change project facts.
Findings, selected Finding and Coordination poll every 2.5 seconds. The ReCheck
collection polls every 1.2 seconds to discover newly revision-triggered checks,
including checks not previously displayed; active run status polls separately.
Terminal run identity changes trigger reconciliation of persisted business outcomes.
No fixture is a production fallback.

## Open engineering evidence

[EvidenceWorkspaceHost](../frontend/src/app/EvidenceWorkspaceHost.tsx) now composes
four lazy C surfaces: Drawing, CAD, IFC and Document. **Those modules are supplied
by PR22 and remain a merge/rebase dependency**, not copied into B’s viewer tree.
A detached local A+B+C rehearsal uses the actual C modules; acceptance is not established. See the [viewer seam](EVIDENCE_VIEWER_ADAPTERS.md).

The host preserves canonical `viewer_target`, finds the exact project/source
revision, checks target/Evidence revision agreement and Evidence hash, downloads
original bytes through authenticated `readSource`, then verifies full SHA-256.
Documents additionally require persisted extraction/chunks matching that hash;
it never builds fake chunks from the Evidence fact. CAD mounts the exact source
as `before`; this host does not initiate a two-revision comparison.

Missing target, missing revision, mismatch, unsupported target or failed loading
retains the receipt and shows a limitation/retry, never substitutes latest bytes
or guesses coordinates. Historical/stale Evidence is labelled as such. Switching
contexts disposes the old host and fences late loads. `viewer_active` means verified
input was handed to C; `onError(null)` is not acknowledged navigation success,
engineering verification or a human decision. C owns actual viewer readiness,
navigation, geometry and SDK cleanup.

## Ask or Investigate in context

Selecting loaded Evidence sets the Agent's source and **that Evidence's revision
ID**, not the newest revision or the Finding's first dependency. BIM Evidence also
supplies its target GlobalIds; other target kinds supply no BIM element selector.
Missing/cleared Evidence clears that context. Selection changes scope only: they do
not start an investigation or create saved Evidence. Source revision/comparison
work actions can separately pass explicit before/after revisions and elements.
Ask is read-only; Investigate starts a persisted scoped run. Backend selectors
intersect and remain authoritative; model prose never enlarges scope. See
[AGENT_INTEGRATION](AGENT_INTEGRATION.md) for request and action safety contracts.

## Coordinate and ReCheck

[FindingFollowUp](../frontend/src/features/FindingFollowUp.tsx) separates append-only
human history, persisted ReCheck outcomes and AgentRun execution status. Manual
requests are available for CONFIRMED Findings. A failed request retains its operation
ID across remounts in the current QueryClient, not reloads/new QueryClients. The
server derives checks from Finding version, revision and operation ID: immutable
replay across changed versions is not guaranteed by the current contract.

`COMPLETED` does not mean `RESOLVED`. Outcomes are RESOLVED, STILL_OPEN, CHANGED or
NEEDS_REVIEW; unavailable/uncertain capability must not manufacture success. New
revisions and Finding changes can stale old results. Closing starts with **no**
selected basis; the human chooses an evidence-bearing RESOLVED ReCheck and submits
CLOSED. The backend still validates current structured evidence for every dependency
and may reject it. ReCheck success, a new upload or an AI answer never auto-closes a
Finding, accepts a Baseline or changes work-package readiness.

## Contract owners

- [Project/source/revision/baseline contract](../PROJECT_LIFECYCLE_API.md)
- [Finding/Evidence/Coordination/ReCheck contract](ENGINEERING_COORDINATION.md)
- [Ask/Investigate/import boundary](AGENT_INTEGRATION.md)
- [Generated OpenAPI](../frontend/openapi.json), [TypeScript schema](../frontend/src/api/schema.ts)
  and [API client](../frontend/src/api/client.ts): regenerate, never hand-edit schemas.
- [Safety rules](../specifications/13_SECURITY_PRIVACY_ACTIONS.md): proposals, permission,
  freshness, approval, idempotency and audit remain authoritative outside the UI.
