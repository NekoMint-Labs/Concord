"""Serve the bundled browser assets with portable module and WASM types."""

import mimetypes
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles


def mount_web(app: FastAPI, directory: Path) -> None:
    if not directory.is_dir():
        return
    # Windows registry associations may label .mjs as text/plain, which browsers
    # reject for module workers. These overrides affect this Python process only.
    mimetypes.add_type("text/javascript", ".mjs")
    mimetypes.add_type("application/wasm", ".wasm")
    app.mount("/", StaticFiles(directory=directory, html=True), name="web")
