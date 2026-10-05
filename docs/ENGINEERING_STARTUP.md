# Optional engineering provider startup

The normal `create_app -> build_services` path can register C's real IfcClash and
IfcTester providers from configuration. This is a minimal composition-root change;
shared lifecycle, domain contracts and product composition are unchanged. A review
is still required. Issue #17 and Draft #22 remain incomplete.

## Configuration

Install the committed BIM extra before enabling the engines:

```sh
uv sync --frozen --group dev --extra bim
```

Set either or both environment variables for the process running Concord:

```text
CCA_IFC_CLASH_ENABLED=true
CCA_IDS_VALIDATION_ENABLED=true
```

Both default to false in every profile, including Local and Desktop. Installing an
optional pack alone does not enable its provider. The ordinary documented launch
command reads these switches; no custom provider-injection script is required.

The composition root registers selected providers before runtime construction and
queued-run recovery. Constructors inspect installed package metadata only; optional
SDK imports and engine work occur when a check runs. Disabled defaults retain the
lightweight application startup.

Explicit `build_services(..., engineering_capabilities=(...))` injection takes
precedence over settings, including an explicitly empty tuple. This keeps custom
composition and deterministic tests compatible without registering extra providers.

## Capability inspection and failure

`/api/capabilities` uses the actual ReCheck registry and required package presence:

- installed but unregistered: `available_disabled`;
- a required SDK package is missing: `unavailable_dependency`;
- configured but absent from the effective registry: `unhealthy`;
- registered with required packages present: `enabled`.

IfcClash requires `ifcclash` and `ifcopenshell`. IDS requires `ifctester`,
`ifcopenshell` and `xmlschema`. Package presence is not a live SDK probe; `service_reachable` stays
unset, including with `probe=true`. A registered provider's version identifies its
engine/settings semantics. No SDK executes to produce a health response.

Enabling an unavailable engine does not prevent ordinary application startup. Its
check returns an explicit `NEEDS_REVIEW` result without success Evidence or closure.
Installing the required pack and restarting reconstructs the configured providers.

## Verification

Focused startup tests cover all switch combinations, environment parsing, explicit
injection, registration before initialization/recovery, missing SDK behavior and
registry/dependency inspection. The real configuration-driven tests run preparation
and recovery in separate processes with DBOS and pinned SDKs. They verify queued
clash and selected-IDS jobs, complete revision/hash provenance and structured positive
Evidence; Findings remain confirmed pending an explicit human decision.

```sh
uv run --frozen --no-sync pytest -q backend/tests/test_engineering_startup.py backend/tests/test_recovery_capabilities.py
uv run --frozen --no-sync pytest -q backend/tests/integration/test_engineering_startup_runtime.py
uv run --frozen --no-sync pytest -q backend/tests/integration/test_optional_local_sdks.py -k ifc --junitxml=.verification-work/startup-required-ifc.xml
uv run --frozen --no-sync python scripts/assert_junit.py .verification-work/startup-required-ifc.xml
```

The existing required IFC SDK lane includes configured startup/recovery cases and
rejects skipped qualification through its existing JUnit gate. No workflow or
lockfile change is needed. Combined B-host/browser/Golden acceptance, native hosts,
large-model performance and native packaging remain distinct acceptance work.

## Local evidence on October 5, 2026

- 46 startup, provider, coordination and recovery cases passed.
- 314 engineering/capability regressions passed without skips.
- Both configuration-driven real SDK/DBOS process-recovery cases passed.
- The required IFC entry passed 14 selected cases; its skip-rejection gate passed.
- 135 focused coverage cases passed. Startup composition, engineering capability
  inspection and provider wrappers have 100% scoped statement/branch coverage.
  Repository-wide coverage is not claimed.
- Full-project Pyright and Ruff passed. Windows tests used a fresh explicit
  temporary directory because the default pytest temporary root denied access.

These checks do not incorporate the independent storage fix in Draft #25 or
qualify B's combined product host. Current-head remote CI and owner review are
recorded separately on Draft #22.
