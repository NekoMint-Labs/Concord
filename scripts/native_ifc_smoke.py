"""Real IFC file input, WebGL rendering and durable import in the packaged WebView.

Called by native_webdriver_smoke --ifc-fixture; does not replace native file-dialog
or real-project/BIM-comparison acceptance. No IPC, HTTP, worker or WASM mocks.
"""

import hashlib
from pathlib import Path

from native_webdriver_client import NativeSession

VIEWER = '[aria-label="IFC 模型查看器"]'
PROJECT = "/api/projects/harbor-east"


def rendered(session: NativeSession):
    session.wait(
        """
        const viewer = document.querySelector(arguments[0]);
        const canvas = viewer?.querySelector('canvas');
        const message = viewer?.querySelector('[role=status]')?.textContent || '';
        return canvas && canvas.width > 0 && canvas.height > 0 && message.includes('已匹配');
        """,
        VIEWER,
        timeout=90,
    )
    assert not session.script(
        "return !!document.querySelector(arguments[0] + ' [role=alert]')", VIEWER
    ), "Real IFC viewer reported an error"


def import_ifc(session: NativeSession, fixture: Path) -> dict:
    session.wait("return !!document.querySelector('.application-shell')")
    profile = session.api("/api/profile")
    assert profile["profile"] == "desktop" and profile["runtime"] == "dbos"
    before = session.api(PROJECT + "/workspace")
    session.click("nav[aria-label='工作区视图']", "BIM")
    session.choose_file('input[aria-label="本地 IFC 文件"]', fixture)
    rendered(session)
    # Opening local geometry must not implicitly upload or mutate project state.
    assert session.api(PROJECT + "/workspace")["state"]["version"] == before["state"]["version"]
    session.click(".bim-workspace", "导入项目")
    session.wait(
        "return document.querySelector('.bim-workspace')?.textContent.includes('导入 已完成。')",
        timeout=90,
    )
    with fixture.open("rb") as original:
        expected_hash = hashlib.file_digest(original, "sha256").hexdigest()
    assert session.api(PROJECT + "/bim/content", digest=True) == expected_hash
    elements = session.api(PROJECT + "/bim/elements")
    assert len(elements) == 3 and all(element["id"] for element in elements)
    session.click(".bim-workspace", "结构化视图")
    session.wait("return document.querySelectorAll('.bim-element').length === 3")
    session.click(".bim-workspace", "打开项目 IFC")
    rendered(session)
    return {
        "status": "PASS",
        "runtime": "dbos",
        "checks": [
            "packaged-native-webview-real-ifc",
            "bundled-wasm-and-fragment-worker",
            "desktop-default-ifcopenshell-without-switch",
            "local-open-does-not-publish",
            "explicit-ui-project-import",
            "three-parsed-ifc-elements",
            "byte-identical-original-download",
            "structured-view-and-imported-geometry-reopen",
        ],
        "sourceSha256": expected_hash,
        "limitations": [
            "Synthetic project and generated real IFC fixture; not IFC diff/B/C joint acceptance.",
            "WebDriver selects the file input; native OS file dialog is a separate manual check.",
        ],
    }
