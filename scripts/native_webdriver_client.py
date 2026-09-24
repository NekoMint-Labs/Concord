"""Small W3C client for real native WebViews, without mocked IPC or API."""

import time
from pathlib import Path

import httpx

ELEMENT_KEY = "element-6066-11e4-a52e-4f735466cecf"


class WebDriverError(RuntimeError):
    pass


class NativeSession:
    def __init__(self, client: httpx.Client):
        self.client = client
        self.session_id = None

    def request(self, method: str, path: str, payload=None, *, timeout: float = 45):
        try:
            response = self.client.request(method, path, json=payload, timeout=timeout)
        except httpx.TimeoutException as exc:
            raise WebDriverError(f"WebDriver {method} {path} exceeded {timeout:g}s") from exc
        try:
            body = response.json()
        except ValueError as exc:
            raise WebDriverError(
                f"Non-JSON WebDriver response: HTTP {response.status_code}"
            ) from exc
        value = body.get("value")
        if response.is_error or isinstance(value, dict) and value.get("error"):
            code = value.get("error", "unknown") if isinstance(value, dict) else "unknown"
            # Startup messages identify runtime/driver incompatibility. Never log
            # script responses, which may contain authenticated application data.
            detail = (
                str(value.get("message", ""))[:1200]
                if path == "/session" and isinstance(value, dict)
                else ""
            )
            raise WebDriverError(f"WebDriver {code}: HTTP {response.status_code} {detail}")
        return value

    def start(self, application: Path, *, user_data_folder: Path | None = None):
        options: dict = {"application": str(application.resolve())}
        if user_data_folder is not None:
            # Edge must know the same profile directory the WebView uses to find
            # its automation endpoint. An environment override alone is insufficient.
            options["webviewOptions"] = {"userDataFolder": str(user_data_folder.resolve())}
        value = self.request(
            "POST",
            "/session",
            {"capabilities": {"alwaysMatch": {"tauri:options": options}}},
            # A fresh Windows runner may initialize WebView2 longer than the
            # default command timeout. App/backend readiness retains its own limit.
            timeout=120,
        )
        if not isinstance(value, dict) or not isinstance(value.get("sessionId"), str):
            raise WebDriverError("Driver did not create a W3C session")
        self.session_id = value["sessionId"]
        self.request(
            "POST", self.path("timeouts"), {"script": 15000, "pageLoad": 30000, "implicit": 0}
        )

    def path(self, suffix: str) -> str:
        if self.session_id is None:
            raise WebDriverError("No native session is active")
        return f"/session/{self.session_id}/{suffix}"

    def script(self, code: str, *args):
        return self.request("POST", self.path("execute/sync"), {"script": code, "args": list(args)})

    def api(self, path: str, *, digest: bool = False):
        # The launch token stays in the WebView, never in test artifacts.
        result = self.request(
            "POST",
            self.path("execute/async"),
            {
                "script": """
                const path = arguments[0], digest = arguments[1];
                const done = arguments[arguments.length - 1];
                window.__TAURI_INTERNALS__.invoke('connection_info').then(async info => {
                    const response = await fetch(info.endpoint + path, {
                        headers: {Authorization: 'Bearer ' + info.token}
                    });
                    let body;
                    if (digest && response.ok) {
                        const hash = await crypto.subtle.digest(
                            'SHA-256', await response.arrayBuffer());
                        body = [...new Uint8Array(hash)]
                            .map(b => b.toString(16).padStart(2, '0')).join('');
                    } else {
                        body = await response.json();
                    }
                    done({status: response.status, body});
                }).catch(() => done({status: 0}));
            """,
                "args": [path, digest],
            },
        )
        if result.get("status") != 200:
            raise WebDriverError("Native authenticated API read failed")
        return result["body"]

    def choose_file(self, selector: str, path: Path):
        element = self.wait("return document.querySelector(arguments[0])", selector)
        self.request(
            "POST",
            self.path(f"element/{element[ELEMENT_KEY]}/value"),
            {"text": str(path.resolve())},
        )

    def wait(self, code: str, *args, timeout: float = 45):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            value = self.script(code, *args)
            if value:
                return value
            time.sleep(0.2)
        raise WebDriverError("Native UI did not reach its asserted state before the deadline")

    def click(self, root: str, label: str, *, startswith: bool = False):
        element = self.wait(
            """
            const controls = [...document.querySelectorAll(arguments[0] + ' :is(button, summary)')];
            const control = controls.find(value => {
                const name = value.getAttribute('aria-label') || value.textContent.trim();
                return arguments[2] ? name.startsWith(arguments[1]) : name === arguments[1];
            });
            return control && !control.disabled ? control : null;
        """,
            root,
            label,
            startswith,
        )
        identity = element.get(ELEMENT_KEY) if isinstance(element, dict) else None
        if not identity:
            raise WebDriverError("Driver did not return a native DOM element")
        # Real WebDriver click, not an API request or a DOM .click() bypass.
        self.request("POST", self.path(f"element/{identity}/click"), {})

    def open_menu(self):
        element = self.wait("return document.querySelector('button[aria-label=\"高级\"]')")
        self.request("POST", self.path(f"element/{element[ELEMENT_KEY]}/value"), {"text": "\ue007"})

    def choose_menu(self, label: str):
        element = self.wait(
            """
            return [...document.querySelectorAll('[role=menuitem]')]
                .find(value => value.textContent.trim() === arguments[0]);
        """,
            label,
        )
        self.request("POST", self.path(f"element/{element[ELEMENT_KEY]}/click"), {})

    def close(self):
        if self.session_id is not None:
            try:
                self.request("DELETE", f"/session/{self.session_id}")
            finally:
                self.session_id = None
