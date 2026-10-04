# Specification index

This directory retains durable project intent and technical constraints. It is
**not an autonomous rebuild handoff**, a report that every capability is accepted,
or an alternative UI architecture. The original 18-file upload/execution procedure
and final implementation prompt are retired.

## Authority and routing

1. Explicit current user/task scope governs work; retired prompts never expand it.
2. Read relevant durable constraints here (use [01_AGENTS](01_AGENTS.md) for routing).
3. Exact contracts come from code/generated schemas and the newer shared contracts:
   [project lifecycle](../PROJECT_LIFECYCLE_API.md),
   [Agent/import](../docs/AGENT_INTEGRATION.md),
   [engineering coordination](../docs/ENGINEERING_COORDINATION.md).
4. [PRODUCT_WORKFLOW](../docs/PRODUCT_WORKFLOW.md) is the single authoritative
   code-derived product behavior description; [viewer seams](../docs/EVIDENCE_VIEWER_ADAPTERS.md)
   distinguish B composition from the pending PR22 C dependency.
5. [STATUS](../STATUS.md) and [VERIFICATION](../VERIFICATION.md) own current state
   and scoped evidence. Requirements and historical runs are not acceptance.

## Retained / retired

- `02`: product intent/non-goals; surface lists are capability coverage, not navigation.
- `03`: old visual direction retired; only demo and interaction safety retained.
- `04`–`09`, `11`–`16`: retain backend/runtime/data/security/desktop/engineering
  constraints. Historical frontend stack/viewer mandates in `04`, `09`, `16` are
  superseded in place; they do not authorize a new shell or removal of old viewers.
- `10`: obsolete frontend direction retired; current seams and retained invariants only.
- `17`: retired autonomous implementation prompt; do not execute it.

“Frozen”, “Required” and “Implemented Optional” in retained technical documents
express constraints/intent, not completed qualification or permission to implement
unrequested work. Never fabricate external-service, real-engine or native success.
Full disposition: [DOCUMENTATION_AUDIT](../docs/DOCUMENTATION_AUDIT.md).
