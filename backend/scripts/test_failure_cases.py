import requests
import time
from pathlib import Path

kml_content = """<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Placemark>
    <name>Paris Boundary Disjoint</name>
    <Polygon>
      <outerBoundaryIs>
        <LinearRing>
          <coordinates>
            2.35,48.85,0 2.36,48.85,0 2.36,48.86,0 2.35,48.86,0 2.35,48.85,0
          </coordinates>
        </LinearRing>
      </outerBoundaryIs>
    </Polygon>
  </Placemark>
</kml>
"""

# 1. Non-overlapping KML test
files = {
    "image": ("osbs_crop.tif", open("sample_data/osbs_crop.tif", "rb"), "image/tiff"),
    "kml": ("disjoint.kml", kml_content.encode("utf-8"), "application/vnd.google-earth.kml+xml"),
}
r = requests.post("http://127.0.0.1:8000/analyze", files=files)
print("1. Disjoint KML submission:", r.status_code, r.json())
job_id = r.json()["job_id"]

for _ in range(20):
    time.sleep(1)
    st = requests.get(f"http://127.0.0.1:8000/jobs/{job_id}").json()
    if st["status"] in ("done", "failed"):
        break

print("Disjoint KML status:", st)
if st["status"] == "done":
    res = requests.get(f"http://127.0.0.1:8000/jobs/{job_id}/result").json()
    print("Disjoint KML tree count:", res["summary"]["tree_count"])
    print("Disjoint KML warnings:", res["summary"]["warnings"])

# 2. Large file near limit test (e.g. 201 MB rejected, 15 MB accepted)
large_rejected = b"X" * (201 * 1024 * 1024)
r_large = requests.post("http://127.0.0.1:8000/analyze", files={"image": ("big.png", large_rejected, "image/png")})
print("2. Large file (>200MB) rejected status:", r_large.status_code, r_large.json())
