"""Bundle Python and the default runtime; end users do not need Python installed."""

import argparse
import importlib.util
import shutil
import subprocess
import sys
import sysconfig
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def native_target() -> str:
    if shutil.which("rustc"):
        metadata = subprocess.check_output(["rustc", "-vV"], text=True)
        return next(
            line.split(": ", 1)[1] for line in metadata.splitlines() if line.startswith("host: ")
        )
    # A Python-only Windows sidecar can be packaged/tested before installing the
    # separate Rust/MSVC prerequisites needed for the Tauri shell.
    windows = {"win-amd64": "x86_64-pc-windows-msvc", "win-arm64": "aarch64-pc-windows-msvc"}
    target = windows.get(sysconfig.get_platform()) if sys.platform == "win32" else None
    if target:
        return target
    raise RuntimeError("Rust toolchain is required to identify this Tauri target triple")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--feature", action="append", choices=["ifcopenshell", "ortools", "docling"], default=[]
    )
    args = parser.parse_args()
    features = sorted({"ifcopenshell", *args.feature})
    for dependency in ["PyInstaller", "dbos", "tzdata", *features]:
        if importlib.util.find_spec(dependency) is None:
            raise SystemExit(
                f"Missing {dependency}. Use uv sync --extra desktop "
                "and the requested optional extras."
            )
    target = native_target()
    artifacts = ROOT / "artifacts"
    command = [
        sys.executable,
        "-m",
        "PyInstaller",
        "--noconfirm",
        "--clean",
        "--onefile",
        "--name",
        "cca-sidecar",
        "--paths",
        str(ROOT / "backend"),
        "--distpath",
        str(artifacts / "sidecar"),
        "--workpath",
        str(artifacts / "pyinstaller"),
        "--specpath",
        str(artifacts),
        "--add-data",
        f"{ROOT / 'backend/migrations'}:migrations",
        "--collect-all",
        "dbos",
        "--collect-all",
        "tzdata",
        "--collect-submodules",
        "app",
        "--collect-all",
        "sqlalchemy",
        "--collect-data",
        "alembic",
        "--copy-metadata",
        "dbos",
    ]
    for module in [
        "uvicorn.logging",
        "uvicorn.loops.auto",
        "uvicorn.protocols.http.auto",
        "uvicorn.protocols.websockets.auto",
        "uvicorn.lifespan.on",
    ]:
        command.extend(["--hidden-import", module])
    for feature in features:
        command.extend(["--collect-all", feature])
    command.append(str(ROOT / "backend/sidecar_entry.py"))
    subprocess.run(command, cwd=ROOT, check=True)
    suffix = ".exe" if sys.platform == "win32" else ""
    destination = ROOT / "desktop/src-tauri/binaries" / f"cca-sidecar-{target}{suffix}"
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(artifacts / "sidecar" / f"cca-sidecar{suffix}", destination)
    print(f"Bundled sidecar: {destination}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
