"""OOXML resource preflight only; real document conversion is a separate SDK test."""

import io
import zipfile

import pytest
from app.adapters.documents_docling import DoclingDocumentParser, validate_office_archive
from app.domain.errors import DomainError


def archive(members):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as output:
        for name, value in members:
            # Preserve hostile ZIP names verbatim on Windows too. ZipInfo's
            # constructor otherwise normalizes backslashes before writing.
            member = zipfile.ZipInfo()
            member.filename = name
            member.compress_type = zipfile.ZIP_DEFLATED
            output.writestr(member, value)
    return stream.getvalue()


def test_office_bounds_use_expanded_bytes_not_small_compressed_size():
    content = archive([("[Content_Types].xml", b"<Types/>"), ("word/document.xml", b"x" * 16384)])
    assert len(content) < 1024
    with pytest.raises(DomainError, match="expanded size"):
        validate_office_archive(content, max_expanded_bytes=4096)
    validate_office_archive(content, max_expanded_bytes=32768)
    with pytest.raises(DomainError, match="entry limit"):
        validate_office_archive(content, max_entries=1)


@pytest.mark.parametrize(
    "name",
    [
        "../outside.xml",
        "/absolute.xml",
        "C:/file.xml",
        "word/../content.xml",
        "word\\document.xml",
        "word//document.xml",
        "word/document.xml\x00hidden",
    ],
)
def test_office_ambiguous_member_paths_are_rejected(name):
    content = archive([("[Content_Types].xml", b"<Types/>"), (name, b"bad")])
    with pytest.raises(DomainError, match="unsafe"):
        validate_office_archive(content)


def test_office_duplicates_and_missing_manifest_are_rejected():
    with pytest.warns(UserWarning, match="Duplicate"):
        content = archive([("[Content_Types].xml", b"a"), ("[Content_Types].xml", b"b")])
    with pytest.raises(DomainError, match="duplicate"):
        validate_office_archive(content)
    with pytest.raises(DomainError, match="manifest"):
        validate_office_archive(archive([("word/document.xml", b"<document/>")]))


@pytest.mark.parametrize("filename", ["unsafe.docx", "unsafe.pptx"])
def test_invalid_office_upload_fails_before_sdk_or_model_loading(filename):
    with pytest.raises(DomainError, match="valid ZIP"):
        DoclingDocumentParser().parse(b"not an archive", filename)
