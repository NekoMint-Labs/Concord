# PDF comparison lifecycle qualification

## Cache reset boundary

`clearPdfDiffCache()` advances an adapter-local generation and releases the retained
artifacts. `comparePdfRevisions()` captures that generation before asynchronous
hash verification, checks it before reuse/worker dispatch, and checks it again
before returning or caching worker output. A reset during either phase rejects
the obsolete comparison explicitly. An old comparison cannot refill a cleared
cache or overwrite a newer result for the same source pair.

The effective cache key remains the ordered source hashes, pinned donor engine
version and normalized comparison options. Cached artifacts are copied before
returning; the caller's requested revision IDs are rebound separately. Both
originals are verified even on a warm cache hit. Entry and byte budgets are
unchanged: at most four entries and 32 MiB of retained overlays/metadata.

## Worker lifetime

Worker output is accepted only after the donor's disposal acknowledgment.
Cancellation, timeout, dispatch failure, worker errors, result decoding failures
and missing output reject explicitly, detach handlers and terminate the worker.
Late callbacks cannot settle a completed request again or retain failed output.

A cache reset invalidates output; it does not immediately interrupt a running
worker. That worker still follows its disposal/timeout path. Viewer replacement
or unmount uses its existing AbortController to terminate work promptly. This
change does not alter A's persisted cache/publication contract or B's host.

## Verification

On October 5, 2026, three reset races failed against the previous implementation:
reset during hash verification, reset while a worker was running, and an old
identical comparison completing after the new generation. All pass with the
adapter generation fence.

Thirty focused lifecycle, input-snapshot and cache-boundary cases pass. They also
exercise aborts, donor cleanup ordering, failures, byte-budget eviction,
replacement accounting, immutable warm reuse and original-hash verification.
Supplemental V8 coverage for `pdfDiffAdapter.ts` and `pdfDiffCache.ts` measures
100% statements/lines/functions and 97.14% branches. The one unexercised branch
is the abort fallback for a signal without a reason; standard AbortController
supplies a reason. This is scoped adapter coverage, not repository-wide coverage.
The supplemental runner uses the already installed independent IFC donor test
runtime; no dependency manifest, lockfile, CI policy or coverage gate changed.

The real Drawing/PDF browser suite passes all twelve cases, including Golden
R1/R2 comparison, masks/crops, canonical target reopening, cancellation, native
markup/text behavior, warm reuse and parser/worker cleanup. The Golden comparison
reports 2,379 changed pixels and one canonical Change. The local sample measured
524 ms diff time; two prepared sheets reopened using one parser worker. These
small fixtures do not establish large-model or native performance acceptance.

Reproduce the normal checks from `frontend/` using the locked toolchain:

```sh
pnpm exec vitest run src/viewers/drawing/pdfDiffLifecycle.test.ts src/viewers/drawing/pdfDiffSnapshot.test.ts src/viewers/drawing/pdfDiffValidation.test.ts
pnpm typecheck
pnpm lint
pnpm build
pnpm exec playwright test --config playwright.engineering.config.ts drawing/drawing.spec.ts
```

Run the browser command from `frontend/`, since the permanent fixture paths are
relative to that directory. Trusted PDF/CAD execution/publication, native
connectors and final integrated Golden acceptance remain separate Issue #17 work.
