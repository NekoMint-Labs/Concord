"""Run the native harness as the same Windows user with normal-user rights.

Hosted Windows runners are elevated. WebView2 150+ intentionally ignores their
environment overrides, including the WebDriver automation settings. Restrict only
this test process; do not change accounts, registry policies or the shipped host.
"""

import ctypes
import subprocess
import sys
from ctypes import wintypes as w
from pathlib import Path


class StartupInfo(ctypes.Structure):
    _fields_ = [
        ("cb", w.DWORD),
        ("reserved", w.LPWSTR),
        ("desktop", w.LPWSTR),
        ("title", w.LPWSTR),
        ("x", w.DWORD),
        ("y", w.DWORD),
        ("width", w.DWORD),
        ("height", w.DWORD),
        ("chars_x", w.DWORD),
        ("chars_y", w.DWORD),
        ("fill", w.DWORD),
        ("flags", w.DWORD),
        ("show", w.WORD),
        ("reserved_size", w.WORD),
        ("reserved_bytes", w.LPVOID),
        ("stdin", w.HANDLE),
        ("stdout", w.HANDLE),
        ("stderr", w.HANDLE),
    ]


class ProcessInfo(ctypes.Structure):
    _fields_ = [
        ("process", w.HANDLE),
        ("thread", w.HANDLE),
        ("pid", w.DWORD),
        ("tid", w.DWORD),
    ]


class IntegrityLabel(ctypes.Structure):
    _fields_ = [("sid", w.LPVOID), ("attributes", w.DWORD)]


def limited_process(arguments: list[str]) -> int:
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    security = ctypes.WinDLL("advapi32", use_last_error=True)

    def bind(library, name, result, parameters):
        function = getattr(library, name)
        function.restype, function.argtypes = result, parameters
        return function

    def checked(result):
        if not result:
            raise ctypes.WinError(ctypes.get_last_error())

    handle_pointer = ctypes.POINTER(w.HANDLE)
    create_level = bind(
        security, "SaferCreateLevel", w.BOOL, [w.DWORD, w.DWORD, w.DWORD, handle_pointer, w.LPVOID]
    )
    compute_token = bind(
        security,
        "SaferComputeTokenFromLevel",
        w.BOOL,
        [w.HANDLE, w.HANDLE, handle_pointer, w.DWORD, w.LPVOID],
    )
    close_level = bind(security, "SaferCloseLevel", w.BOOL, [w.HANDLE])
    convert_sid = bind(
        security, "ConvertStringSidToSidW", w.BOOL, [w.LPCWSTR, ctypes.POINTER(w.LPVOID)]
    )
    sid_length = bind(security, "GetLengthSid", w.DWORD, [w.LPVOID])
    set_token = bind(
        security, "SetTokenInformation", w.BOOL, [w.HANDLE, w.DWORD, w.LPVOID, w.DWORD]
    )
    create_process = bind(
        security,
        "CreateProcessAsUserW",
        w.BOOL,
        [
            w.HANDLE,
            w.LPCWSTR,
            w.LPWSTR,
            w.LPVOID,
            w.LPVOID,
            w.BOOL,
            w.DWORD,
            w.LPVOID,
            w.LPCWSTR,
            ctypes.POINTER(StartupInfo),
            ctypes.POINTER(ProcessInfo),
        ],
    )
    close = bind(kernel, "CloseHandle", w.BOOL, [w.HANDLE])
    free = bind(kernel, "LocalFree", w.LPVOID, [w.LPVOID])
    std_handle = bind(kernel, "GetStdHandle", w.HANDLE, [w.DWORD])
    wait = bind(kernel, "WaitForSingleObject", w.DWORD, [w.HANDLE, w.DWORD])
    exit_code = bind(kernel, "GetExitCodeProcess", w.BOOL, [w.HANDLE, ctypes.POINTER(w.DWORD)])
    level, token, sid = w.HANDLE(), w.HANDLE(), w.LPVOID()
    process = ProcessInfo()
    try:
        # SAFER_SCOPEID_USER / SAFER_LEVELID_NORMALUSER / SAFER_LEVEL_OPEN.
        checked(create_level(2, 0x20000, 1, ctypes.byref(level), None))
        checked(compute_token(level, None, ctypes.byref(token), 0, None))
        # Explicitly lower integrity to Medium; keep the same user and filesystem ACLs.
        checked(convert_sid("S-1-16-8192", ctypes.byref(sid)))
        label = IntegrityLabel(sid, 0x20)  # SE_GROUP_INTEGRITY
        checked(set_token(token, 25, ctypes.byref(label), ctypes.sizeof(label) + sid_length(sid)))
        startup = StartupInfo()
        startup.cb, startup.flags, startup.show = ctypes.sizeof(startup), 0x101, 0
        startup.stdin, startup.stdout, startup.stderr = [std_handle(i) for i in (-10, -11, -12)]
        command = ctypes.create_unicode_buffer(
            subprocess.list2cmdline(
                [
                    sys.executable,
                    str(Path(__file__).resolve()),
                    "--limited-child",
                    *arguments,
                ]
            )
        )
        checked(
            create_process(
                token,
                sys.executable,
                command,
                None,
                None,
                True,
                0x08000000,
                None,
                str(Path.cwd()),
                ctypes.byref(startup),
                ctypes.byref(process),
            )
        )
        waited = wait(process.process, 900_000)
        if waited != 0:
            raise RuntimeError("Normal-user native harness did not finish within 15 minutes")
        code = w.DWORD()
        checked(exit_code(process.process, ctypes.byref(code)))
        return code.value
    finally:
        if process.process and wait(process.process, 0) == 258:  # WAIT_TIMEOUT
            # Only the test child launched above and its descendants, including on interruption.
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                capture_output=True,
                timeout=15,
                check=False,
            )
        for handle in (process.thread, process.process, token):
            if handle:
                close(handle)
        if sid:
            free(sid)
        if level:
            close_level(level)


def main() -> int:
    if sys.platform != "win32":
        raise RuntimeError("The normal-user native launcher is Windows-only")
    arguments = sys.argv[1:]
    if arguments and arguments[0] == "--limited-child":
        if ctypes.windll.shell32.IsUserAnAdmin():
            raise RuntimeError("Native qualification must run without administrator rights")
        sys.argv = [sys.argv[0], *arguments[1:]]
        from native_webdriver_smoke import main as native_main

        print("Native harness: normal-user rights, same packaged application", flush=True)
        return native_main()
    print(f"Native launcher elevated: {bool(ctypes.windll.shell32.IsUserAnAdmin())}", flush=True)
    return limited_process(arguments)


if __name__ == "__main__":
    raise SystemExit(main())
