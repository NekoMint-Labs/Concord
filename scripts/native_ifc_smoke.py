"""Real IFC file input, WebGL rendering and durable import in the packaged WebView.

Called by native_webdriver_smoke --ifc-fixture; does not replace native file-dialog
or real-project/BIM-comparison acceptance. No IPC, HTTP, worker or WASM mocks.
"""

import hashlib
from pathlib import Path

from native_webdriver_client import NativeSession

VIEWER = '[aria-label="IFC 模型查看器"]'
PROJECT = "/api/projects/harbor-east"


def rendered(session: NativeSession, phase: str):
    session.wait(
        """
        const viewer = document.querySelector(arguments[0]);
        const canvas = viewer?.querySelector('canvas');
        const message = viewer?.querySelector('[role=status]')?.textContent || '';
        return canvas && canvas.width > 0 && canvas.height > 0 && message.includes('已匹配');
        """,
        VIEWER,
        timeout=90,
        phase=phase,
    )
    assert not session.script(
        "return !!document.querySelector(arguments[0] + ' [role=alert]')", VIEWER
    ), "Real IFC viewer reported an error"


def import_ifc(session: NativeSession, fixture: Path) -> dict:
    session.wait("return !!document.querySelector('.startup')", phase="startup ready")
    session.click(".startup", "打开示例项目")
    session.wait("return !!document.querySelector('.work-list')", phase="initial workspace ready")
    profile = session.api("/api/profile")
    assert profile["profile"] == "desktop" and profile["runtime"] == "dbos"
    before = session.api(PROJECT + "/workspace")
    session.click("nav[aria-label='主要工作区']", "模型")
    session.choose_file('input[aria-label="本地 IFC 文件"]', fixture)
    rendered(session, "local IFC rendered")
    # Opening local geometry must not implicitly upload or mutate project state.
    assert session.api(PROJECT + "/workspace")["state"]["version"] == before["state"]["version"]
    # A loaded model closes its native 模型 disclosure; reopen it before import.
    session.click("section[aria-label='模型工作区']", "模型")
    session.click("section[aria-label='模型工作区']", "添加到项目")
    session.wait(
        "return /已添加到项目|正在处理项目模型|模型处理完成/.test("
        "document.querySelector('.bim-workspace')?.textContent || '')",
        phase="project import started",
    )
    session.wait(
        "return document.querySelector('.bim-workspace')?.textContent.includes('模型处理完成')",
        timeout=90,
        phase="project import completed",
    )
    with fixture.open("rb") as original:
        expected_hash = hashlib.file_digest(original, "sha256").hexdigest()
    models = [item for item in session.api(PROJECT + "/sources") if item["source"]["kind"] == "BIM"]
    assert len(models) == 1 and models[0]["latest_revision_id"]
    source_id, revision_id = models[0]["source"]["id"], models[0]["latest_revision_id"]
    revision = f"{PROJECT}/sources/{source_id}/revisions/{revision_id}"
    assert session.api(revision + "/content", digest=True) == expected_hash
    elements = session.api(revision + "/bim-snapshot")["elements"]
    assert len(elements) == 3 and all(element["global_id"] for element in elements)
    session.click("nav[aria-label='主要工作区']", "工作")
    session.click("nav[aria-label='主要工作区']", "模型")
    rendered(session, "project model rendered")
    session.wait(
        "return document.querySelector('[aria-label=\"IFC 模型查看器\"] [role=status]')"
        "?.textContent.includes('project-model.ifc')",
        phase="project model reopened",
    )
    assert not session.script(
        "return (document.querySelector('[aria-label=\"模型工作区\"]')"
        "?.textContent || '').includes('本地预览')"
    ), "Local preview remained active after import"
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
