"""Content-addressed, engine/version/parameter-aware derived artifacts."""

import base64
import hashlib
import json

from app.domain.errors import Conflict, NotFound
from app.ports.services import FileStore


class DerivedArtifacts:
    def __init__(self, storage: FileStore):
        self.storage = storage

    @staticmethod
    def key(engine: str, version: str, hashes: tuple[str, ...], parameters: dict) -> str:
        identity = json.dumps(
            [engine, version, hashes, parameters],
            sort_keys=True,
            separators=(",", ":"),
            allow_nan=False,
        ).encode()
        return "derived/" + hashlib.sha256(identity).hexdigest()

    def read(self, key: str) -> bytes | None:
        try:
            raw = self.storage.read(key)
        except NotFound:
            return None
        try:
            envelope = json.loads(raw)
            payload = base64.b64decode(envelope["payload"], validate=True)
            if hashlib.sha256(payload).hexdigest() != envelope["sha256"]:
                raise ValueError("checksum mismatch")
        except (ValueError, KeyError, TypeError, AttributeError) as exc:
            raise Conflict("Derived artifact failed integrity validation") from exc
        return payload

    def write(self, key: str, content: bytes) -> None:
        self.storage.put(
            key,
            json.dumps(
                {
                    "sha256": hashlib.sha256(content).hexdigest(),
                    "payload": base64.b64encode(content).decode("ascii"),
                },
                ensure_ascii=False,
            ).encode("utf-8"),
        )
