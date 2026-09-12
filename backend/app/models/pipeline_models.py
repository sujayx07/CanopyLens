from typing import Any, Optional

from pydantic import BaseModel, Field


class ImageMeta(BaseModel):
    path: str
    width: int
    height: int
    band_count: int
    georeferenced: bool
    crs: Optional[str] = None
    gsd: dict[str, Optional[float]] = Field(
        default_factory=lambda: {"x": None, "y": None}
    )
    bounds: dict[str, Optional[float]] = Field(
        default_factory=lambda: {"left": None, "bottom": None, "right": None, "top": None}
    )
    notes: list[str] = Field(default_factory=list)


class Tile(BaseModel):
    index: int
    offset_x: int
    offset_y: int
    width: int
    height: int
    image: Any = None


class Detection(BaseModel):
    xmin: float
    ymin: float
    xmax: float
    ymax: float
    score: float
    label: str = "Tree"
    tile_index: Optional[int] = None
    tile_offset_x: Optional[int] = None
    tile_offset_y: Optional[int] = None
    on_tile_edge: bool = False
    in_full_coords: bool = False


class CrownPolygon(BaseModel):
    id: int
    detection: Detection
    geometry_wkt: str
    area_px: float
    mask_quality: float
    confidence: float
    confidence_bucket: str
    area_m2: Optional[float] = None


class AreaResult(BaseModel):
    area_units: str = "m2"
    count: int = 0
    sum_area: float = 0.0
    union_area: float = 0.0
    per_crown: list[dict[str, Any]] = Field(default_factory=list)
    note: Optional[str] = None


class PipelineResult(BaseModel):
    image: ImageMeta
    total_trees: int = 0
    detections: list[Detection] = Field(default_factory=list)
    crowns: list[CrownPolygon] = Field(default_factory=list)
    area: AreaResult = Field(default_factory=AreaResult)
    confidence_distribution: dict[str, int] = Field(
        default_factory=lambda: {"high": 0, "medium": 0, "low": 0}
    )
    warnings: list[str] = Field(default_factory=list)
    kml_boundary_wkt: Optional[str] = None