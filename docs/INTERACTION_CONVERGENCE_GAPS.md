# Spatial targeting boundary

The earlier pre-Finding issue/API proposal is retired. Persisted Finding,
Coordination, ReCheck and typed ViewerTarget now exist; use
[ENGINEERING_COORDINATION](ENGINEERING_COORDINATION.md), not a new issue architecture.

The durable gap remains: analysis-scoped Constraints are not persistent engineering
Findings, and GUIDs/Evidence prose do not establish world-space coordinates or a
revision-aware pin for deleted geometry. Missing targets remain explicit limitations.
BIM's non-null `viewpoint` is reserved/unsupported in C's canonical adapter; do not
guess camera axes/units. BCF camera exchange does not own human Coordination state.
See [PRODUCT_WORKFLOW](PRODUCT_WORKFLOW.md) and the [viewer seam](EVIDENCE_VIEWER_ADAPTERS.md).
