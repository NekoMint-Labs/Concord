# Contributing

This is the main contribution entry point for Concord.

Normal feature and bug work starts from an Issue. Do not develop features directly on
`main`. A very small repository or administrative chore may omit an Issue only when it does
not change product behavior, a shared contract, or a shared seam; use
`chore/<short-name>` and explain why no Issue was used in the PR description. Read deeper
documents only when they are relevant to the current change.

## Quick start

Create or claim the relevant task or bug Issue, assign its owner, then follow this path:

```text
Issue
→ assign owner
→ update local main
→ create short-lived issue branch
→ implement
→ focused local verification
→ Draft PR
→ self-review
→ Ready for review
→ peer approval
→ CI
→ squash merge
```

An eligible no-Issue repository or administrative chore follows the same path starting from
an updated local `main`; document the exception in its PR description.

Branch from the latest `main` and use one of:

- `feat/<issue-number>-short-name`
- `fix/<issue-number>-short-name`
- `chore/<issue-number>-short-name`
- `chore/<short-name>` for an eligible no-Issue repository or administrative chore

See [TEAM_DEVELOPMENT.md](TEAM_DEVELOPMENT.md) for ownership and shared-seam details.

## Before you start

- Read the assigned Issue and confirm its acceptance criteria and dependencies. For an
  eligible no-Issue repository or administrative chore, confirm it does not change product
  behavior, a shared contract, or a shared seam.
- Check whether the change involves a shared seam.
- Read `specifications/00_READ_ME_FIRST.md` and `specifications/01_AGENTS.md`, then
  consult only the specifications relevant to the change. Do not reread the whole
  specification pack for one change.
- Read the deeper guidance linked below only when its detail is needed for the affected
  area.

## Development boundaries

Keep changes focused and do not mix them with unrelated cleanup or refactoring. Preserve
architecture and safety invariants, including snapshot freshness, evidence traceability,
approvals, permissions, idempotency, auditability, cancellation, and recovery.

Generator-owned API artifacts must be regenerated only through documented locked
commands; never hand-edit them. Keep `.env.example` safe: it must contain placeholders only,
never real secrets. Preserve notices for approved third-party materials. Do not include
secrets, private project data, build output, caches, logs, local artifacts, or incidental
dependency changes.

## Pull request requirements

Before requesting review:

- [ ] The PR addresses one focused acceptance goal.
- [ ] The related Issue is linked with `Closes #<issue-number>` when applicable.
- [ ] A no-Issue repository or administrative chore explains in the PR description why it
  does not change product behavior, a shared contract, or a shared seam.
- [ ] No unrelated cleanup or refactoring is included.
- [ ] Relevant local verification has been run.
- [ ] Generated artifacts were regenerated through documented commands when required.
- [ ] Meaningful UI changes include screenshots.
- [ ] Shared seams and risks are declared in the PR description.
- [ ] The author has completed a self-review.
- [ ] No secrets, private project data, build output, caches, logs, or local artifacts are included.

Before merge:

- [ ] At least one peer approval has been obtained.
- [ ] Applicable CI is green.
- [ ] Review conversations are resolved.
- [ ] The PR is squash merged into `main`.

## Shared seams

Changes involving shared contracts or seams require brief coordination before
implementation. This includes:

- API / schemas;
- Domain / ports;
- database / migrations;
- generated API artifacts;
- dependencies / lockfiles;
- workflows / CI;
- major application composition files.

See [TEAM_DEVELOPMENT.md](TEAM_DEVELOPMENT.md) for ownership, exact shared seams, and
coordination rules.

## Verification

Run the smallest relevant check first, then the standard checks required for the affected
area.

- [DEVELOPMENT.md](DEVELOPMENT.md) — local development and common commands
- [VERIFICATION.md](VERIFICATION.md) — full verification and qualification paths

## Review expectations

Reviewers primarily check:

1. Whether the Issue acceptance criteria are satisfied.
2. Whether architecture and safety invariants are preserved.
3. Whether verification is sufficient.
4. Whether unrelated changes are included.
5. Whether the change unnecessarily expands shared seams or coupling.

## Further guidance

- [TEAM_DEVELOPMENT.md](TEAM_DEVELOPMENT.md) — ownership, shared seams, review, and
  Definition of Done
- [DEVELOPMENT.md](DEVELOPMENT.md) — local development and common verification commands
- [VERIFICATION.md](VERIFICATION.md) — detailed verification and qualification
- [STATUS.md](STATUS.md) — current project status
- [`specifications/`](specifications/) — authoritative technical specifications; read only
  as needed
