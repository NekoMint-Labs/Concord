# Demo and interaction constraints — visual direction retired

**Retired UI plan:** the former fixed left/center/right shell, frozen shadcn stack
and global run-strip direction are not current implementation instructions. Product
navigation/composition is owned by [PRODUCT_WORKFLOW](../docs/PRODUCT_WORKFLOW.md),
not a new mock or this historical handoff. The durable demo/safety constraints below
remain; they are not evidence of acceptance of the dirty B/C integration.

## Interaction safety

- Navigation stays usable during long runs; stream progress and reconcile authoritative
  state through normal queries rather than blocking the entire UI.
- Only presentation state may update optimistically; project facts are server-owned.
- Errors/degraded capabilities stay visible and recoverable.
- Consequential conclusions link to persisted Evidence and exact revisions; inferred
  interpretation is not structured engineering truth.
- Dangerous actions show risk/approval requirements; no UI shortcut bypasses policy.
- Common actions are keyboard accessible, focus remains visible and color is not the
  only state signal. Respect reduced motion and use lazy heavy viewers.

## Demonstration boundary

Synthetic demo sources are allowed when explicitly labelled. Seed/reset them through
existing provider/repository contracts; never insert visual fixtures as fallback
project data or hard-code final READY/BLOCKED outcomes.

The historical five-minute coordination story is: initially READY work package →
change event → captured snapshot and streamed run → impact/Evidence/blockers →
BLOCKED → proposed resolution → required human approval → explicitly simulated or
controlled update → fresh recheck → READY only when real rules clear the blockers.
A workforce/resource/predecessor scenario reuses the same core.

Advanced IFC/document/solver/GIS/model/Desktop proofs are scoped capability evidence,
not automatic Finding closure, Baseline acceptance or production qualification.
Unavailable dependencies/credentials/health must be reported truthfully. Successful
import alone does not establish healthy runtime integration. Current workflow,
C target behavior and verification limits are linked from PRODUCT_WORKFLOW.
