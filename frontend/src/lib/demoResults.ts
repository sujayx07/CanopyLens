import type { JobResult, TreeFeature } from "./api";

// 28 realistic polygonal tree crown features around Mount Hood / Pacific NW
function generateDemoFeatures(): TreeFeature[] {
  const baseLng = -122.189;
  const baseLat = 45.312;
  const features: TreeFeature[] = [];

  const treesData = [
    { id: 402, dx: 0, dy: 0, r: 0.00045, conf: 0.964, bucket: "high" as const, area: 34.2 },
    { id: 101, dx: -0.0012, dy: 0.0008, r: 0.0005, conf: 0.94, bucket: "high" as const, area: 42.1 },
    { id: 102, dx: -0.0008, dy: 0.0012, r: 0.0004, conf: 0.91, bucket: "high" as const, area: 28.5 },
    { id: 103, dx: -0.0003, dy: 0.0009, r: 0.0006, conf: 0.95, bucket: "high" as const, area: 55.4 },
    { id: 104, dx: 0.0005, dy: 0.0011, r: 0.00048, conf: 0.88, bucket: "high" as const, area: 36.8 },
    { id: 105, dx: 0.0011, dy: 0.0007, r: 0.00052, conf: 0.93, bucket: "high" as const, area: 44.0 },
    { id: 106, dx: -0.0015, dy: 0.0001, r: 0.00042, conf: 0.89, bucket: "high" as const, area: 30.2 },
    { id: 107, dx: -0.0009, dy: -0.0002, r: 0.00055, conf: 0.92, bucket: "high" as const, area: 48.6 },
    { id: 108, dx: -0.0004, dy: -0.0006, r: 0.00046, conf: 0.87, bucket: "high" as const, area: 35.1 },
    { id: 109, dx: 0.0002, dy: -0.0005, r: 0.00062, conf: 0.97, bucket: "high" as const, area: 58.2 },
    { id: 110, dx: 0.0008, dy: -0.0003, r: 0.0004, conf: 0.76, bucket: "medium" as const, area: 26.9 },
    { id: 111, dx: 0.0013, dy: -0.0001, r: 0.00045, conf: 0.84, bucket: "medium" as const, area: 32.4 },
    { id: 112, dx: -0.0014, dy: -0.0009, r: 0.00053, conf: 0.91, bucket: "high" as const, area: 45.3 },
    { id: 113, dx: -0.0008, dy: -0.0011, r: 0.00047, conf: 0.86, bucket: "high" as const, area: 37.0 },
    { id: 114, dx: -0.0002, dy: -0.0013, r: 0.00058, conf: 0.94, bucket: "high" as const, area: 51.7 },
    { id: 115, dx: 0.0004, dy: -0.0012, r: 0.00044, conf: 0.72, bucket: "medium" as const, area: 29.8 },
    { id: 116, dx: 0.0010, dy: -0.0010, r: 0.00051, conf: 0.89, bucket: "high" as const, area: 41.5 },
    { id: 117, dx: 0.0015, dy: -0.0008, r: 0.00038, conf: 0.58, bucket: "low" as const, area: 22.1 },
    { id: 118, dx: -0.0018, dy: 0.0005, r: 0.00049, conf: 0.90, bucket: "high" as const, area: 39.4 },
    { id: 119, dx: -0.0006, dy: 0.0016, r: 0.00054, conf: 0.92, bucket: "high" as const, area: 46.2 },
    { id: 120, dx: 0.0001, dy: 0.0015, r: 0.00043, conf: 0.85, bucket: "medium" as const, area: 31.0 },
    { id: 121, dx: 0.0007, dy: 0.0014, r: 0.00056, conf: 0.93, bucket: "high" as const, area: 49.8 },
    { id: 122, dx: 0.0014, dy: 0.0012, r: 0.00041, conf: 0.79, bucket: "medium" as const, area: 27.5 },
    { id: 123, dx: -0.0019, dy: -0.0004, r: 0.00052, conf: 0.91, bucket: "high" as const, area: 43.8 },
    { id: 124, dx: -0.0011, dy: -0.0016, r: 0.00046, conf: 0.88, bucket: "high" as const, area: 34.6 },
    { id: 125, dx: -0.0004, dy: -0.0018, r: 0.00061, conf: 0.95, bucket: "high" as const, area: 56.9 },
    { id: 126, dx: 0.0005, dy: -0.0017, r: 0.00048, conf: 0.87, bucket: "high" as const, area: 38.3 },
    { id: 127, dx: 0.0012, dy: -0.0015, r: 0.00053, conf: 0.92, bucket: "high" as const, area: 44.9 },
  ];

  for (const tree of treesData) {
    const cx = baseLng + tree.dx;
    const cy = baseLat + tree.dy;
    const r = tree.r;
    // 8-point polygon with slight organic variation
    const points: [number, number][] = [];
    const numPoints = 8;
    for (let i = 0; i < numPoints; i++) {
      const angle = (i / numPoints) * 2 * Math.PI;
      const jitter = 0.85 + Math.sin(i * 3 + tree.id) * 0.15;
      const px = cx + Math.cos(angle) * r * jitter;
      const py = cy + Math.sin(angle) * r * jitter * 0.9;
      points.push([px, py]);
    }
    // Close polygon
    points.push(points[0]);

    features.push({
      type: "Feature",
      geometry: {
        type: "Polygon",
        coordinates: [points],
      },
      properties: {
        tree_id: tree.id,
        area_m2: tree.area,
        area_px: Math.round(tree.area * 21.5),
        confidence: tree.conf,
        confidence_bucket: tree.bucket,
        on_tile_edge: false,
        mask_quality: 0.95,
      },
    });
  }

  return features;
}

export const DEMO_PACIFIC_NW_RESULT: JobResult = {
  type: "FeatureCollection",
  features: generateDemoFeatures(),
  summary: {
    tree_count: 28,
    sum_area_m2: 1142.6,
    union_area_m2: 986.4,
    canopy_cover_percent: 64.8,
    confidence_breakdown: {
      high: 22,
      medium: 5,
      low: 1,
    },
    georeferenced: true,
    warnings: [
      "Dense overstory clustering detected in NW quadrant.",
      "Suppressed sub-canopy understory stems omitted per optical sensor physics.",
    ],
    image_width: 1024,
    image_height: 1024,
    image_bounds: {
      west: -122.193,
      south: 45.309,
      east: -122.185,
      north: 45.315,
      coordinates: [
        [-122.193, 45.315],
        [-122.185, 45.315],
        [-122.185, 45.309],
        [-122.193, 45.309],
      ],
    },
  },
};
