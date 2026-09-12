import csv
import io
import logging
from typing import Optional

from shapely import wkt
from shapely.affinity import affine_transform as _shapely_affine
from shapely.geometry import box, mapping
from shapely.ops import transform as _reproject

from app.models.jobs import JobRecord
from app.services.pipeline import utm_epsg_for

logger = logging.getLogger(__name__)


def _geom_in_crs(geom, transform: dict[str, float]):
    return _shapely_affine(
        geom, [transform["a"], transform["b"], transform["d"], transform["e"], transform["c"], transform["f"]]
    )


def _geom_in_wgs84(job: JobRecord, geom):
    if job.transform is not None:
        geom = _geom_in_crs(geom, job.transform)
    if job.result is not None and job.result.image.georeferenced and job.result.image.crs:
        from pyproj import Transformer

        t = Transformer.from_crs(job.result.image.crs, "EPSG:4326", always_xy=True)
        geom = _reproject(t.transform, geom)
    return geom


def _project_area_m2(polygon, src_crs: str) -> Optional[float]:
    from pyproj import Transformer

    bounds = polygon.bounds
    to_ll = Transformer.from_crs(src_crs, "EPSG:4326", always_xy=True)
    lon, lat = to_ll.transform((bounds[0] + bounds[2]) / 2.0, (bounds[1] + bounds[3]) / 2.0)
    to_utm = Transformer.from_crs(src_crs, f"EPSG:{utm_epsg_for(lon, lat)}", always_xy=True)
    reprojected = _reproject(to_utm.transform, polygon)
    reprojected = reprojected if reprojected.is_valid else reprojected.buffer(0)
    return float(reprojected.area)


def _analyzed_area_m2(job: JobRecord) -> Optional[float]:
    result = job.result
    if result is None or not result.image.georeferenced or job.transform is None:
        return None
    footprint = box(0, 0, result.image.width, result.image.height)
    footprint = _geom_in_crs(footprint, job.transform)
    footprint = footprint if footprint.is_valid else footprint.buffer(0)
    if job.kml_crs_wkt is not None:
        boundary = wkt.loads(job.kml_crs_wkt)
        boundary = boundary if boundary.is_valid else boundary.buffer(0)
        return _project_area_m2(boundary, result.image.crs)
    return _project_area_m2(footprint, result.image.crs)


def build_summary(job: JobRecord) -> dict:
    result = job.result
    area = result.area
    georeferenced = result.image.georeferenced
    analyzed_m2 = _analyzed_area_m2(job)
    canopy_cover = None
    if analyzed_m2 and analyzed_m2 > 0 and area.area_units == "m2":
        canopy_cover = round(area.union_area / analyzed_m2 * 100.0, 2)

    canopy_cover_note = None
    if canopy_cover is None:
        if not georeferenced:
            canopy_cover_note = (
                "Canopy cover percentage is unavailable (N/A) because the image is not georeferenced "
                "(no defined real-world boundary or physical area to divide by)."
            )
        elif analyzed_m2 is None or analyzed_m2 <= 0:
            canopy_cover_note = (
                "Canopy cover percentage is unavailable (N/A) because no defined analysis boundary "
                "or physical extent could be computed."
            )

    summary = {
        "tree_count": result.total_trees,
        "sum_area_m2": area.sum_area if area.area_units == "m2" else None,
        "union_area_m2": area.union_area if area.area_units == "m2" else None,
        "canopy_cover_percent": canopy_cover,
        "canopy_cover_note": canopy_cover_note,
        "confidence_breakdown": dict(result.confidence_distribution),
        "georeferenced": georeferenced,
        "warnings": list(result.warnings),
        "image_width": result.image.width,
        "image_height": result.image.height,
        "image_bounds": None,
    }
    if georeferenced and job.transform is not None:
        try:
            footprint = box(0, 0, result.image.width, result.image.height)
            footprint_wgs = _geom_in_wgs84(job, footprint)
            minx, miny, maxx, maxy = footprint_wgs.bounds
            summary["image_bounds"] = {
                "west": minx,
                "south": miny,
                "east": maxx,
                "north": maxy,
                "coordinates": [
                    [minx, maxy],  # top-left
                    [maxx, maxy],  # top-right
                    [maxx, miny],  # bottom-right
                    [minx, miny],  # bottom-left
                ],
            }
        except Exception as e:
            logger.warning("failed to compute WGS84 image_bounds: %s", e)
    if not georeferenced:
        summary["sum_area_px"] = area.sum_area
        summary["union_area_px"] = area.union_area
    return summary


def build_result_payload(job: JobRecord) -> dict:
    result = job.result
    features = []
    for crown in result.crowns:
        geom = wkt.loads(crown.geometry_wkt)
        if geom.is_empty:
            continue
        geom = _geom_in_wgs84(job, geom)
        features.append(
            {
                "type": "Feature",
                "geometry": mapping(geom),
                "properties": {
                    "tree_id": crown.id,
                    "area_m2": crown.area_m2,
                    "area_px": crown.area_px,
                    "confidence": crown.confidence,
                    "confidence_bucket": crown.confidence_bucket,
                    "on_tile_edge": crown.detection.on_tile_edge,
                    "mask_quality": crown.mask_quality,
                },
            }
        )
    return {
        "type": "FeatureCollection",
        "features": features,
        "summary": build_summary(job),
    }


def build_csv(job: JobRecord) -> str:
    result = job.result
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(
        [
            "tree_id",
            "area_m2",
            "area_px",
            "confidence",
            "confidence_bucket",
            "on_tile_edge",
            "mask_quality",
            "bbox_xmin",
            "bbox_ymin",
            "bbox_xmax",
            "bbox_ymax",
        ]
    )
    for crown in result.crowns:
        writer.writerow(
            [
                crown.id,
                crown.area_m2,
                crown.area_px,
                round(crown.confidence, 4),
                crown.confidence_bucket,
                crown.detection.on_tile_edge,
                round(crown.mask_quality, 4),
                round(crown.detection.xmin, 2),
                round(crown.detection.ymin, 2),
                round(crown.detection.xmax, 2),
                round(crown.detection.ymax, 2),
            ]
        )
    return buffer.getvalue()