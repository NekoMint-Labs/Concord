"""Build the pinned IFC donor without importing its app into Concord's bundle."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import tarfile
from pathlib import Path, PurePosixPath

REVISION = "5073adf1f5fadef76129460555482b6507c2be74"
ARCHIVE_SHA = "cd2c89a3e0410ab492d92b0e2ccfa3b16441630132a8a0a837b9b1052248afd5"
LOCK_SHA = "cd7223b245b36d2e0534bbed4499185e94647ae56463ec95632f8dd105db7ea0"
ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CACHE = ROOT / ".cache/engineering-viewers"
SOURCE = CACHE / "ifc-source"


def adaptation_fingerprint() -> str:
    """Reject stale prepared trees when recorded patches/overlays change."""
    digest = hashlib.sha256()
    digest.update(REVISION.encode("ascii"))
    for directory in (HERE / "patches", HERE / "overlays"):
        for file in sorted(directory.rglob("*")):
            if file.is_file():
                digest.update(file.relative_to(HERE).as_posix().encode("utf-8"))
                digest.update(b"\0")
                digest.update(file.read_bytes())
                digest.update(b"\0")
    return digest.hexdigest()


def verify_adapted_source() -> None:
    marker = SOURCE / ".concord-adapted"
    expected = REVISION + ":" + adaptation_fingerprint()
    if not marker.exists() or marker.read_text(encoding="ascii") != expected:
        raise RuntimeError(
            "Prepared IFC source does not match recorded adaptations; use a fresh source directory"
        )


def native(path: Path) -> Path:
    return Path("\\\\?\\" + str(path.resolve())) if os.name == "nt" else path


def run(*args: str, cwd: Path, env: dict[str, str] | None = None) -> None:
    subprocess.run(args, cwd=cwd, env=env, check=True)


def fetch_archive(archive: Path) -> None:
    repo = CACHE / "ifc-donor.git"
    if not repo.exists():
        run("git", "init", "--bare", str(repo), cwd=ROOT)
    run(
        "git",
        "fetch",
        "--depth=1",
        "https://github.com/j03rul4nd/ifc-viewer-online.git",
        REVISION,
        cwd=repo,
    )
    actual = subprocess.check_output(
        ["git", "rev-parse", "FETCH_HEAD"], cwd=repo, text=True
    ).strip()
    if actual != REVISION:
        raise RuntimeError("Unexpected IFC donor revision")
    with archive.open("wb") as output:
        subprocess.run(
            ["git", "archive", "--format=tar", REVISION], cwd=repo, stdout=output, check=True
        )


def extract(archive: Path) -> None:
    SOURCE.mkdir(parents=True, exist_ok=False)
    with tarfile.open(archive) as content:
        for member in content:
            name = PurePosixPath(member.name)
            if (
                name.is_absolute()
                or ".." in name.parts
                or any(":" in p or "\\" in p for p in name.parts)
                or not (member.isfile() or member.isdir())
            ):
                raise RuntimeError("Unsafe donor archive member")
            dest = native(SOURCE.joinpath(*name.parts))
            if member.isdir():
                dest.mkdir(parents=True, exist_ok=True)
            else:
                dest.parent.mkdir(parents=True, exist_ok=True)
                with content.extractfile(member) as src, dest.open("wb") as out:
                    shutil.copyfileobj(src, out)
    for patch in sorted((HERE / "patches").glob("*.patch")):
        run("git", "apply", "--ignore-space-change", str(patch), cwd=SOURCE)
    shutil.copytree(HERE / "overlays", SOURCE, dirs_exist_ok=True)
    (SOURCE / ".concord-adapted").write_text(
        REVISION + ":" + adaptation_fingerprint(), encoding="ascii"
    )


def publish() -> None:
    dest = ROOT / "frontend/public/viewer/ifc"
    dest.mkdir(parents=True, exist_ok=True)
    # Only the application and local assets; donor marketing/SEO pages are not packaged.
    for name in ["assets", "decoders"]:
        shutil.copytree(SOURCE / "dist" / name, dest / name, dirs_exist_ok=True)
    (dest / "sdk").mkdir(exist_ok=True)
    for name in ["ifc-viewer.es.js", "ifc-viewer.es.d.ts"]:
        shutil.copyfile(SOURCE / "dist/sdk" / name, dest / "sdk" / name)
    shutil.copyfile(SOURCE / "LICENSE", dest / "LICENSE")
    collect_licenses(dest)
    for name in ["index.html", "web-ifc.wasm", "web-ifc-mt.wasm"]:
        shutil.copyfile(SOURCE / "dist" / name, dest / name)
    shutil.copyfile(
        SOURCE / "node_modules/@thatopen/fragments/dist/Worker/worker.mjs",
        dest / "fragments-worker.mjs",
    )
    (dest / "capability.json").write_text(
        '{"name":"concord-ifc-integration","revision":"'
        + REVISION
        + '","lock":"'
        + LOCK_SHA
        + '","navigation":"canonical-bim-v1"}',
        encoding="utf-8",
    )


def collect_licenses(dest: Path) -> None:
    """Keep original npm license/notice texts with the standalone assets."""
    lock = json.loads((SOURCE / "package-lock.json").read_text(encoding="utf-8"))
    records = []
    for location, metadata in lock["packages"].items():
        if not location or not location.startswith("node_modules/"):
            continue
        package = SOURCE / location
        if not package.is_dir():
            continue
        record = {
            "package": location,
            "version": metadata.get("version"),
            "license": metadata.get("license"),
            "files": [],
        }
        for file in package.iterdir():
            if not file.is_file() or not file.name.upper().startswith(
                ("LICENSE", "LICENCE", "COPYING", "NOTICE")
            ):
                continue
            target = dest / "licenses" / location.removeprefix("node_modules/") / file.name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(file, target)
            record["files"].append(str(target.relative_to(dest)).replace("\\", "/"))
        records.append(record)
    (dest / "third-party-notices.json").write_text(json.dumps(records, indent=2), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(__doc__)
    parser.add_argument(
        "--publish-only", action="store_true", help="Copy an already qualified local build"
    )
    args = parser.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    archive = CACHE / "ifc-source.tar"
    if not args.publish_only:
        if not archive.exists():
            fetch_archive(archive)
        if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_SHA:
            raise RuntimeError("IFC donor archive hash mismatch")
        if not SOURCE.exists():
            extract(archive)
        else:
            verify_adapted_source()
        if hashlib.sha256((SOURCE / "package-lock.json").read_bytes()).hexdigest() != LOCK_SHA:
            raise RuntimeError("IFC donor lock hash mismatch")
        npm = shutil.which("npm.cmd" if os.name == "nt" else "npm")
        if not npm:
            raise RuntimeError("npm is required for the isolated locked IFC build")
        env = {key: value for key, value in os.environ.items() if not key.startswith("VITE_")}
        env["BASE_PATH"] = "/viewer/ifc/"
        disabled = [
            "VITE_POSTHOG_KEY",
            "VITE_CLERK_PUBLISHABLE_KEY",
            "VITE_SUPABASE_URL",
            "VITE_SUPABASE_ANON_KEY",
            "VITE_SUBSCRIBE_URL",
            "VITE_REPORT_URL",
            "VITE_API_URL",
        ]
        flags = [
            "VITE_FEATURE_GIS",
            "VITE_FEATURE_SOLAR",
            "VITE_FEATURE_POINTCLOUD",
            "VITE_FEATURE_MESH",
            "VITE_FEATURE_VIDEO",
        ]
        (SOURCE / ".env.production.local").write_text(
            "\n".join([key + "=" for key in disabled] + [key + "=false" for key in flags]) + "\n",
            encoding="utf-8",
        )
        run(npm, "ci", "--ignore-scripts", cwd=SOURCE, env=env)
        run(npm, "run", "build", cwd=SOURCE, env=env)
    verify_adapted_source()
    if hashlib.sha256((SOURCE / "package-lock.json").read_bytes()).hexdigest() != LOCK_SHA:
        raise RuntimeError("IFC donor lock hash mismatch")
    publish()


if __name__ == "__main__":
    main()
