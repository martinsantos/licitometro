"""
Watches /opt/licitometro/inbox/ every 5 minutes for new files.
Runs OCR via Gemini and saves to pileta_documentos. Moves processed files.
"""
import logging
from pathlib import Path
from motor.motor_asyncio import AsyncIOMotorDatabase

logger = logging.getLogger(__name__)

INBOX_DIR = Path("/opt/licitometro/inbox")
PROCESSED_DIR = INBOX_DIR / "processed"
FAILED_DIR = INBOX_DIR / "failed"

SUPPORTED = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf"}

MIME_MAP = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pdf": "application/pdf",
}


async def watch_inbox(db: AsyncIOMotorDatabase) -> dict:
    """Process all files in inbox dir. Returns counts."""
    from services.ocr_service import get_ocr_service

    ocr = get_ocr_service()

    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    FAILED_DIR.mkdir(parents=True, exist_ok=True)

    if not INBOX_DIR.exists():
        logger.info("Inbox dir %s does not exist, skipping", INBOX_DIR)
        return {"processed": 0, "failed": 0, "skipped": 0}

    files = [f for f in INBOX_DIR.iterdir() if f.is_file() and f.suffix.lower() in SUPPORTED]

    if not files:
        return {"processed": 0, "failed": 0, "skipped": 0}

    logger.info("Inbox watcher: found %d files to process", len(files))
    processed = failed = 0

    for fpath in files:
        suffix = fpath.suffix.lower()
        mime = MIME_MAP.get(suffix, "application/octet-stream")
        try:
            file_bytes = fpath.read_bytes()
            await ocr.ingest(
                db=db,
                file_bytes=file_bytes,
                filename=fpath.name,
                mime_type=mime,
                pileta="privada",
                fuente="folder",
                metadata={"inbox_path": str(fpath)},
            )
            dest = PROCESSED_DIR / fpath.name
            # Avoid overwriting already-processed files with same name
            if dest.exists():
                dest = PROCESSED_DIR / f"{fpath.stem}_{fpath.stat().st_mtime_ns}{fpath.suffix}"
            fpath.rename(dest)
            processed += 1
            logger.info("Inbox: processed %s → %s", fpath.name, dest.name)
        except Exception as e:
            logger.error("Inbox: failed to process %s: %s", fpath.name, e)
            failed_dest = FAILED_DIR / fpath.name
            try:
                fpath.rename(failed_dest)
            except Exception:
                pass
            failed += 1

    return {"processed": processed, "failed": failed, "skipped": 0}
