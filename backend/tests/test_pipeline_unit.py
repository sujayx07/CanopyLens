import tempfile
from pathlib import Path

import numpy as np

from app.models.pipeline_models import CrownPolygon, Detection, ImageMeta
from app.services.pipeline import (
    compute_areas,
    compute_tile_windows,
    confidence_bucket,
    parse_kml_to_wgs84,
    score_confidence,
    utm_epsg_for,
)


def make_crown(cid: int, wkt: str, score: float = 0.9) -> CrownPolygon:
    return CrownPolygon(
        id=cid,
        detection=Detection(xmin=0, ymin=0, xmax=10, ymax=10, score=score),
        geometry_wkt=wkt,
        area_px=100.0,
        mask_quality=1.0,
        confidence=0.9,
        confidence_bucket="high",
    )


def test_tile_windows_cover_full_extent():
    windows = compute_tile_windows(2000, 2000, tile_size=1024, overlap=0.15)
    assert len(windows) == 9
    last = windows[-1]
    assert (last[0] + last[2], last[1] + last[3]) == (2000, 2000)
    full = [w for w in windows if (w[2], w[3]) == (1024, 1024)]
    assert len(full) == 4
    for w in windows:
        assert w[2] <= 1024
        assert w[3] <= 1024


def test_tile_windows_small_image_single_tile():
    windows = compute_tile_windows(100, 80, tile_size=1024, overlap=0.15)
    assert windows == [(0, 0, 100, 80)]


def test_score_confidence():
    det = Detection(xmin=0, ymin=0, xmax=10, ymax=10, score=0.9)
    full_mask = np.ones((10, 10), dtype=bool)
    empty_mask = np.zeros((10, 10), dtype=bool)
    assert abs(score_confidence(det, full_mask, False) - 0.94) < 1e-9
    assert abs(score_confidence(det, full_mask, True) - 0.79) < 1e-9
    assert abs(score_confidence(det, empty_mask, False) - 0.69) < 1e-9


def test_score_confidence_implausible_mask_penalized():
    det = Detection(xmin=0, ymin=0, xmax=10, ymax=10, score=0.9)
    huge_mask = np.ones((32, 32), dtype=bool)
    assert abs(score_confidence(det, huge_mask, False) - 0.69) < 1e-9


def test_confidence_bucket():
    assert confidence_bucket(0.9) == "high"
    assert confidence_bucket(0.7) == "high"
    assert confidence_bucket(0.5) == "medium"
    assert confidence_bucket(0.4) == "medium"
    assert confidence_bucket(0.1) == "low"


def test_compute_areas_pixel_units():
    polygons = [
        make_crown(0, "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))"),
        make_crown(1, "POLYGON ((5 0, 15 0, 15 10, 5 10, 5 0))"),
    ]
    meta = ImageMeta(path="x.png", width=100, height=100, band_count=3, georeferenced=False)
    result = compute_areas(polygons, meta)
    assert result.area_units == "pixels"
    assert result.count == 2
    assert result.sum_area == 200.0
    assert abs(result.union_area - 150.0) < 1e-6
    assert result.note is not None


def test_compute_areas_georeferenced_requires_transform():
    polygons = [make_crown(0, "POLYGON ((0 0, 10 0, 10 10, 0 10, 0 0))")]
    meta = ImageMeta(
        path="x.tif",
        width=100,
        height=100,
        band_count=3,
        georeferenced=True,
        crs="EPSG:4326",
    )
    try:
        compute_areas(polygons, meta)
        raise AssertionError("expected ValueError")
    except ValueError:
        pass


def test_utm_epsg_for():
    assert utm_epsg_for(-122.4, 47.6) == 32610
    assert utm_epsg_for(-122.4, -33.8) == 32710
    assert utm_epsg_for(12.0, 55.0) == 32633


def test_parse_kml_to_wgs84():
    kml = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <Polygon>
        <outerBoundaryIs>
          <LinearRing>
            <coordinates>
              0,0 1,0 1,1 0,1 0,0
            </coordinates>
          </LinearRing>
        </outerBoundaryIs>
      </Polygon>
    </Placemark>
  </Document>
</kml>"""
    with tempfile.TemporaryDirectory() as tmp:
        path = Path(tmp) / "boundary.kml"
        path.write_text(kml)
        geom = parse_kml_to_wgs84(str(path))
    assert geom is not None
    assert abs(geom.area - 1.0) < 1e-6