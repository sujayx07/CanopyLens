import argparse
import glob
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.services.pipeline import run_pipeline

IMAGE_EXTENSIONS = {".tif", ".tiff", ".png", ".jpg", ".jpeg"}


def find_sample_image(sample_dir: str) -> str:
    if os.path.isfile(sample_dir):
        return sample_dir
    for ext in IMAGE_EXTENSIONS:
        for candidate in glob.glob(os.path.join(sample_dir, f"*{ext}")):
            return candidate
    return ""


def main() -> int:
    parser = argparse.ArgumentParser(description="Run the CanopyLens pipeline on a sample image.")
    parser.add_argument("--image", help="Path to the sample image (defaults to backend/sample_data/).")
    parser.add_argument("--kml", default=None, help="Optional KML boundary file.")
    args = parser.parse_args()

    sample_dir = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_data"
    )
    image_path = args.image or find_sample_image(sample_dir)
    if not image_path or not os.path.isfile(image_path):
        print(
            "No sample image found. Place a GeoTIFF (or PNG/JPG) in "
            "backend/sample_data/ or pass --image <path>."
        )
        return 1

    print(f"Image     : {image_path}")
    print(f"KML       : {args.kml or '(none)'}")
    start = time.time()
    result = run_pipeline(image_path, kml_path=args.kml)
    elapsed = time.time() - start

    print(f"\nTREE COUNT         : {result.total_trees}")
    print(f"SUM CROWN AREA     : {result.area.sum_area:.2f} {result.area.area_units}")
    print(f"UNION AREA         : {result.area.union_area:.2f} {result.area.area_units}")
    print(f"CONFIDENCE         : {result.confidence_distribution}")
    print(f"WARNINGS           : {result.warnings}")
    print(f"TIME               : {elapsed:.1f}s")

    top = result.crowns[:5]
    if top:
        print("\nFirst crowns:")
        for c in top:
            print(
                f"  crown #{c.id:4d}  conf={c.confidence:.2f} ({c.confidence_bucket})  "
                f"area_px={c.area_px:.1f}"
            )
    return 0


if __name__ == "__main__":
    sys.exit(main())