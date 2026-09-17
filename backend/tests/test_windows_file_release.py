"""Exercise a real Windows deny-delete handle, not a mocked filesystem exception."""

import sys
import threading

import pytest
from test_release_tooling import load


@pytest.mark.skipif(sys.platform != "win32", reason="Windows file-sharing semantics")
def test_shutdown_check_waits_for_actual_database_handle_release(tmp_path):
    module = load("http_smoke")
    database = tmp_path / "app.db"
    database.write_bytes(b"persisted test data")
    handle = database.open("rb")
    release = threading.Timer(0.2, handle.close)
    try:
        with pytest.raises(PermissionError):
            database.replace(tmp_path / "probe")
        release.start()
        module.assert_sqlite_files_released(tmp_path)
        assert handle.closed
        assert database.read_bytes() == b"persisted test data"
    finally:
        handle.close()
        release.cancel()
        if release.ident is not None:
            release.join()
