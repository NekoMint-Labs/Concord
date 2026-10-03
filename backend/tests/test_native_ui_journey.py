"""Offline UI-call contracts; these do not qualify a packaged native WebView."""

from importlib import import_module
from pathlib import Path

import pytest

SCRIPTS = Path(__file__).resolve().parents[2] / "scripts"


def test_native_coordination_uses_current_work_peek_and_explicit_revision(tmp_path, monkeypatch):
    from unittest.mock import Mock, call

    monkeypatch.syspath_prepend(str(SCRIPTS))
    module = import_module("native_webdriver_smoke")

    session = Mock(spec=module.NativeSession)
    session.wait.side_effect = lambda code, *args, **kwargs: (
        {module.ELEMENT_KEY: "revision-input"} if "input[type=text]" in code else True
    )
    session.path.return_value = "/session/native/element/revision-input/value"
    session.script.return_value = False
    session.api.side_effect = [
        {"profile": "desktop", "runtime": "dbos"},
        {"analysis": {"constraints": ["design"], "snapshot": {"id": "before"}}, "stale": False},
        {
            "analysis": {"constraints": [], "snapshot": {"id": "after", "version": 2}},
            "state": {"version": 2},
            "analysis_run": {"status": "COMPLETED"},
            "stale": False,
        },
    ]
    monkeypatch.setattr(module, "screenshot", Mock())

    module.coordination(session, tmp_path)

    assert session.click.call_args_list == [
        call(".startup", "打开示例项目"),
        call(".work-list", "东翼风管安装", startswith=True),
        call("[aria-label='所选工作事项']", "查看详情"),
        call("nav[aria-label='主要工作区']", "工作"),
        call(".work-list", "东翼风管安装", startswith=True),
        call("[aria-label='所选工作事项']", "查看详情"),
        call("[aria-label='当前工作区操作']", "记录变更"),
        call(".event-dialog", "提交并分析"),
        call("section[aria-label='工作包概览']", "审查处理方案"),
        call("[aria-label='判断依据与处理详情']", "批准 R", startswith=True),
        call("[aria-label='判断依据与处理详情']", "执行并重新检查"),
    ]
    calls = session.mock_calls
    typed = call.request("POST", session.path.return_value, {"text": "V17"})
    assert calls.index(typed) < calls.index(call.click(".event-dialog", "提交并分析"))
    session.choose_menu.assert_called_once_with("能力诊断")


def test_native_ifc_opens_current_example_button(tmp_path, monkeypatch):
    from unittest.mock import Mock

    monkeypatch.syspath_prepend(str(SCRIPTS))
    module = import_module("native_ifc_smoke")

    session = Mock(spec=module.NativeSession)
    session.api.side_effect = RuntimeError("stop after startup")
    with pytest.raises(RuntimeError, match="stop after startup"):
        module.import_ifc(session, tmp_path / "model.ifc")
    session.click.assert_called_once_with(".startup", "打开示例项目")
