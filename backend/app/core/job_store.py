import threading
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.models.jobs import JobRecord
from app.models.pipeline_models import PipelineResult


def _now() -> datetime:
    return datetime.now(timezone.utc)


class JobStore:
    def __init__(self) -> None:
        self._jobs: dict[str, JobRecord] = {}
        self._lock = threading.Lock()

    def create(self, image_path: str, kml_path: Optional[str] = None) -> JobRecord:
        now = _now()
        record = JobRecord(
            id=uuid.uuid4().hex,
            status="queued",
            created_at=now,
            updated_at=now,
            image_path=image_path,
            kml_path=kml_path,
        )
        with self._lock:
            self._jobs[record.id] = record
        return record

    def get(self, job_id: str) -> Optional[JobRecord]:
        with self._lock:
            return self._jobs.get(job_id)

    def update(
        self,
        job_id: str,
        *,
        status: Optional[str] = None,
        error: Optional[str] = None,
    ) -> Optional[JobRecord]:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return None
            if status is not None:
                record.status = status
            if error is not None:
                record.error = error
            record.updated_at = _now()
            return record

    def complete(
        self,
        job_id: str,
        *,
        result: PipelineResult,
        transform: Optional[dict[str, float]] = None,
        kml_crs_wkt: Optional[str] = None,
    ) -> Optional[JobRecord]:
        with self._lock:
            record = self._jobs.get(job_id)
            if record is None:
                return None
            record.status = "done"
            record.error = None
            record.result = result
            record.transform = transform
            record.kml_crs_wkt = kml_crs_wkt
            record.updated_at = _now()
            return record


job_store = JobStore()