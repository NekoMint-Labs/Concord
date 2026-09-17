import hashlib
import re
from pathlib import Path

from sqlalchemy import bindparam, select, text
from sqlalchemy.orm import Session

from app.adapters.persistence.database import SQLRepositoryFactory
from app.adapters.persistence.document_records import prepared_record
from app.adapters.persistence.tables import ChunkRow, DocumentRow
from app.domain.errors import Conflict, DomainError, NotFound, ProviderError
from app.domain.models import new_id, utcnow
from app.ports.providers import DocumentChunk, DocumentMetadata, DocumentParser, PreparedDocument
from app.ports.services import FileStore


class DocumentRepository:
    def __init__(self, engine, storage: FileStore, parser: DocumentParser) -> None:
        self.engine, self.storage, self.parser = engine, storage, parser

    def import_file(
        self, project_id: str, filename: str, content: bytes, document_id: str | None = None
    ) -> dict:
        # Standalone seed/import callers retain their existing API. Capability jobs
        # instead publish the prepared record with their job/evidence transaction.
        prepared = self.prepare_file(project_id, filename, content, document_id)
        with SQLRepositoryFactory(self.engine).open(project_id, write=True) as repo:
            published = repo.publish_document(prepared)
        return published.metadata.model_dump(mode="json")

    def prepare_file(
        self, project_id: str, filename: str, content: bytes, document_id: str | None = None
    ) -> PreparedDocument:
        if (
            not filename
            or Path(filename).name != filename
            or "\\" in filename
            or len(filename) > 180
        ):
            raise DomainError("Invalid filename")
        digest = hashlib.sha256(content).hexdigest()
        doc_id = document_id or new_id()
        with Session(self.engine) as session:
            previous = prepared_record(session, doc_id)
            if previous:
                if (
                    previous.metadata.content_hash != digest
                    or previous.metadata.project_id != project_id
                ):
                    raise Conflict("Document import identifier belongs to different content")
                return previous
        chunks = self.parser.parse(content, filename)
        if not chunks:
            raise ProviderError("Parser returned no document chunks")
        if len({chunk.id for chunk in chunks}) != len(chunks) or any(
            not chunk.id
            or not chunk.text.strip()
            or not chunk.parser
            or chunk.source_hash != digest
            or (chunk.page is not None and chunk.page < 1)
            for chunk in chunks
        ):
            raise ProviderError(
                "Parser output failed source hash, identity, text, or page validation"
            )
        key = f"documents/{doc_id}/{digest}"
        self.storage.put(key, content)
        # Staged hash-addressed objects may outlive a cancellation/rollback. They
        # are not discoverable document facts, and retries reuse the same key.
        return PreparedDocument(
            metadata=DocumentMetadata(
                id=doc_id,
                project_id=project_id,
                filename=filename,
                content_hash=digest,
                parser=chunks[0].parser,
                created_at=utcnow(),
            ),
            object_key=key,
            chunks=tuple(chunks),
        )

    @staticmethod
    def _metadata(row: DocumentRow) -> dict:
        return {
            "id": row.id,
            "project_id": row.project_id,
            "filename": row.filename,
            "content_hash": row.content_hash,
            "parser": row.parser,
            "created_at": row.created_at,
        }

    def documents(self, project_id: str) -> list[dict]:
        with Session(self.engine) as session:
            return [
                self._metadata(row)
                for row in session.scalars(
                    select(DocumentRow)
                    .where(DocumentRow.project_id == project_id)
                    .order_by(DocumentRow.created_at.desc())
                    .limit(100)
                )
            ]

    def chunks(self, document_id: str) -> list[DocumentChunk]:
        with Session(self.engine) as session:
            if session.get(DocumentRow, document_id) is None:
                raise NotFound("Document not found")
            return [
                DocumentChunk.model_validate(row.payload)
                for row in session.scalars(
                    select(ChunkRow).where(ChunkRow.document_id == document_id)
                )
            ]

    def content(self, document_id: str) -> tuple[str, bytes]:
        with Session(self.engine) as session:
            row = session.get(DocumentRow, document_id)
            if row is None:
                raise NotFound("Document not found")
            content = self.storage.read(row.object_key)
            if hashlib.sha256(content).hexdigest() != row.content_hash:
                raise ProviderError("Stored document content failed its source hash check")
            return row.filename, content

    def search(
        self,
        project_id: str,
        query: str,
        limit: int = 20,
        *,
        source_hashes: tuple[str, ...] | None = None,
    ) -> list[DocumentChunk]:
        words = re.findall(r"[\w-]+", query, flags=re.UNICODE)[:12]
        if not words or source_hashes == ():
            return []
        limit = max(1, min(limit, 100))
        with Session(self.engine) as session:
            if self.engine.dialect.name == "sqlite":
                expression = " AND ".join('"' + word.replace('"', '""') + '"' for word in words)
                scoped = ""
                parameters = {"query": expression, "project": project_id, "limit": limit}
                if source_hashes is not None:
                    scoped = (
                        " AND chunk_id IN (SELECT c.id FROM document_chunks c "
                        "JOIN documents d ON d.id = c.document_id "
                        "WHERE c.project_id = :project AND d.project_id = :project "
                        "AND d.content_hash IN :hashes)"
                    )
                    parameters["hashes"] = source_hashes
                statement = text(
                    "SELECT chunk_id FROM document_fts WHERE document_fts MATCH "
                    ":query AND project_id = :project" + scoped + " ORDER BY rank LIMIT :limit"
                )
                if source_hashes is not None:
                    statement = statement.bindparams(bindparam("hashes", expanding=True))
                ids = session.execute(statement, parameters).scalars().all()
                if not ids:
                    return []
                rows = session.scalars(select(ChunkRow).where(ChunkRow.id.in_(ids))).all()
                mapping = {row.id: row for row in rows}
                return [DocumentChunk.model_validate(mapping[i].payload) for i in ids]
            statement = select(ChunkRow).where(ChunkRow.project_id == project_id)
            if source_hashes is not None:
                statement = statement.where(
                    ChunkRow.document_id.in_(
                        select(DocumentRow.id).where(
                            DocumentRow.project_id == project_id,
                            DocumentRow.content_hash.in_(source_hashes),
                        )
                    )
                )
            for word in words:
                statement = statement.where(ChunkRow.text.ilike(f"%{word}%"))
            return [
                DocumentChunk.model_validate(r.payload)
                for r in session.scalars(statement.limit(limit))
            ]
