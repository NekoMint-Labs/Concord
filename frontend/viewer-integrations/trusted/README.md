# Optional trusted comparison pack

Build/provision and inject this C-owned pack only against the A-owned
ComparisonExecutor contract. See `docs/PINNED_COMPARISON_EXECUTORS.md` at the
repository root for pinned versions, ownership, commands, tests and limits.

The pack's input comes from the trusted backend process, not a product browser.
Its fixed runner launches Chromium for the existing real PDF/CAD workers, then
reuses the canonical mappers after raw output is retained by A. No dev server,
client-selected program/URL, product host or default startup registration is added.
Build assets remain ignored. The node_modules, browser distribution, and SDK/font
assets require explicit operator provisioning; no native packaging claim is made.
