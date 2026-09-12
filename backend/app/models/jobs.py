from datetime import datetime
from typing import Optional

from pydantic import BaseModel

from app.models.pipeline_models import PipelineResult


class JobRecord(BaseModel):
    id: str
    status: str = "queued"
    created_at: datetime
    updated_at: datetime
    image_path: str
    kml_path: Optional[str] = None
    error: Optional[str] = None
    result: Optional[PipelineResult] = None
    transform: Optional[dict[str, float]] = None
    kml_crs_wkt: Optional[str] = None


class JobStatusResponse(BaseModel):
    status: str
    error: Optional[str] = None