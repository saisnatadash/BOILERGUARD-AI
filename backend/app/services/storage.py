"""Secure local file storage behind a small interface, so object storage can replace it later.

Stored files are addressed by generated keys only. User-supplied filenames are never used as paths.
"""
import hashlib
import io
import uuid
from functools import lru_cache
from pathlib import Path

from fastapi import HTTPException
from PIL import Image, UnidentifiedImageError

from app.core.config import get_settings

ALLOWED_IMAGE_FORMATS = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png")}


class LocalFileStorage:
    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def save(self, data: bytes, suffix: str) -> tuple[str, str]:
        if suffix not in (".jpg", ".png", ".pdf", ".csv"):
            raise ValueError("Unsupported storage suffix")
        key = f"{uuid.uuid4().hex}{suffix}"
        (self.root / key).write_bytes(data)
        return key, hashlib.sha256(data).hexdigest()

    def _path(self, key: str) -> Path:
        if Path(key).name != key or ".." in key:
            raise HTTPException(status_code=400, detail="Invalid storage key")
        path = (self.root / key).resolve()
        if self.root not in path.parents:
            raise HTTPException(status_code=400, detail="Invalid storage key")
        return path

    def read(self, key: str) -> bytes:
        path = self._path(key)
        if not path.exists():
            raise HTTPException(status_code=404, detail="Stored file is missing")
        return path.read_bytes()

    def path(self, key: str) -> Path:
        return self._path(key)

    def delete(self, key: str) -> None:
        path = self._path(key)
        if path.exists():
            path.unlink()


@lru_cache
def evidence_storage() -> LocalFileStorage:
    return LocalFileStorage(get_settings().upload_dir)


@lru_cache
def report_storage() -> LocalFileStorage:
    return LocalFileStorage(get_settings().report_dir)


def validate_image_upload(data: bytes, declared_type: str | None) -> tuple[int, int, str, str]:
    """Return (width, height, content_type, suffix) for a valid JPEG or PNG; raise 422 otherwise."""
    settings = get_settings()
    if len(data) == 0:
        raise HTTPException(status_code=422, detail="Uploaded file is empty")
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds the {settings.max_upload_mb} MB limit")
    try:
        probe = Image.open(io.BytesIO(data))
        fmt = probe.format
        probe.verify()
        image = Image.open(io.BytesIO(data))
        width, height = image.size
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(status_code=422, detail="File is not a valid image")
    if fmt not in ALLOWED_IMAGE_FORMATS:
        raise HTTPException(status_code=422, detail="Only JPEG and PNG images are supported")
    content_type, suffix = ALLOWED_IMAGE_FORMATS[fmt]
    if declared_type and declared_type not in (content_type, "application/octet-stream"):
        raise HTTPException(status_code=422, detail="Declared content type does not match the file contents")
    return width, height, content_type, suffix
