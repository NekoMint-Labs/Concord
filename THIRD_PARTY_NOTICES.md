# Third-party notices

## MinIO RELEASE.2025-10-15T17-29-55Z (CI fixture only)

- Source: https://github.com/minio/minio/tree/9e49d5e7a648f00e26f2246f4dc28e6b07f8c84a
- License: GNU Affero General Public License v3.0; upstream LICENSE remains in the source checkout
- Use: ephemeral loopback-only S3 service for real storage integration tests
- Modification: none; CI builds the pinned official source because its former registry image is unavailable
- Distribution: not bundled in the application, desktop installers or release artifacts
- Replaceability: test-service provisioning only; the application retains its S3-compatible storage adapter

## IfcDiff 0.8.5

- Project: IfcDiff, distributed by the IfcOpenShell project
- Source: https://github.com/IfcOpenShell/IfcOpenShell/tree/main/src/ifcdiff
- Package: https://pypi.org/project/ifcdiff/0.8.5/
- License: GNU Lesser General Public License v3.0 or later
- Use: compares two IFC revisions and reports added, deleted, and changed GlobalIds
- Modification: none; Concord imports the published package through an adapter
- Replaceability: isolated behind `IfcComparisonEngine`; stored Concord records use project-owned models

IfcDiff is an optional BIM dependency. It is not vendored into this repository. The upstream
license and source remain available at the links above.
