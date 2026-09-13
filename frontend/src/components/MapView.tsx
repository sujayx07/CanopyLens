/**
 * MapView.tsx — Interactive Geospatial Map / Pixel Overlay for Tree Crowns
 *
 * Requirements:
 * 1. Full-width MapLibre GL map instance
 * 2. If georeferenced:
 *    - Image overlay on the map coordinates (using image_bounds or GeoTIFF extent)
 *    - Polygons colored by confidence_bucket:
 *        green (#3a9b40) = high, amber (#c8a84b) = medium, red (#c84b4b) = low
 * 3. If not georeferenced:
 *    - Plain image display with an SVG overlay aligning detected crown polygons
 * 4. Clicking a crown polygon opens a popup with:
 *    - tree_id, area_m2 (or px), confidence %
 *    - "Flag as incorrect" button that invokes onFlagTree(treeId)
 */

import { useEffect, useRef, useState, useMemo } from "react";
import * as maplibregl from "maplibre-gl";
import type { Map, GeoJSONSource, MapMouseEvent } from "maplibre-gl";
import type { TreeFeature, ResultSummary } from "../lib/api";
import { getJobImageUrl } from "../lib/api";

interface MapViewProps {
  jobId: string;
  features: TreeFeature[];
  summary: ResultSummary;
  onFlagTree: (treeId: number) => void;
  flaggedIds: Set<number>;
}

export function MapView({
  jobId,
  features,
  summary,
  onFlagTree,
  flaggedIds,
}: MapViewProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<Map | null>(null);
  const [selectedFeature, setSelectedFeature] = useState<TreeFeature | null>(null);
  const [popupPos, setPopupPos] = useState<{ x: number; y: number } | null>(null);
  const [webGlFailed, setWebGlFailed] = useState(false);
  const isGeoreferenced = summary.georeferenced && !webGlFailed;

  // Filter out flagged crowns
  const activeFeatures = useMemo(() => {
    return features.filter((f) => !flaggedIds.has(f.properties.tree_id));
  }, [features, flaggedIds]);

  // FeatureCollection GeoJSON
  const activeGeoJson: GeoJSON.FeatureCollection = useMemo(() => {
    return {
      type: "FeatureCollection",
      features: activeFeatures as unknown as GeoJSON.Feature[],
    };
  }, [activeFeatures]);

  const imageUrl = getJobImageUrl(jobId);

  // ─────────────────────────────────────────────────────────────────────────────
  // 1. GEOREFERENCED MAP (MapLibre GL)
  // ─────────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!isGeoreferenced || !mapContainerRef.current) return;

    // Check WebGL2 capability in browser
    try {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") || canvas.getContext("webgl");
      if (!gl) {
        setWebGlFailed(true);
        return;
      }
    } catch {
      setWebGlFailed(true);
      return;
    }

    const cartoApiKey =
      (import.meta.env.VITE_CARTO_API_KEY as string | undefined) ||
      "eyJhbGciOiJIUzI1NiJ9.eyJhIjoiYWNfMm05d2U2N2UiLCJqdGkiOiI0ODQ5N2I4MCJ9.SEMBKiqTW6nNRNOe-Wd5pGxpJUY_BxyJCj4NsnFGlUs";
    const cartoTileQuery = cartoApiKey ? `?api_key=${encodeURIComponent(cartoApiKey)}` : "";

    let map: Map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: {
          version: 8,
          sources: {
            osm: {
              type: "raster",
              tiles: [
                `https://a.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png${cartoTileQuery}`,
                `https://b.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png${cartoTileQuery}`,
                `https://c.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png${cartoTileQuery}`,
                `https://d.basemaps.cartocdn.com/rastertiles/dark_all/{z}/{x}/{y}@2x.png${cartoTileQuery}`,
              ],
              tileSize: 256,
              attribution: '&copy; <a href="https://carto.com/">CARTO</a> &copy; OpenStreetMap',
            },
          },
          layers: [
            {
              id: "osm-tiles",
              type: "raster",
              source: "osm",
              minzoom: 0,
              maxzoom: 20,
            },
          ],
        },
        center: [0, 0],
        zoom: 1,
      });
    } catch (e) {
      console.warn("MapLibre WebGL initialization failed, falling back to SVG overlay:", e);
      setWebGlFailed(true);
      return;
    }

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    mapInstanceRef.current = map;

    map.on("load", () => {
      // 1. Add raster overlay if image_bounds are present
      if (summary.image_bounds?.coordinates) {
        map.addSource("raster-image", {
          type: "image",
          url: imageUrl,
          coordinates: summary.image_bounds.coordinates,
        });

        map.addLayer({
          id: "raster-image-layer",
          type: "raster",
          source: "raster-image",
          paint: {
            "raster-opacity": 0.85,
          },
        });
      }

      // 2. Add crowns GeoJSON source
      map.addSource("crowns", {
        type: "geojson",
        data: activeGeoJson,
      });

      // 3. Fill layer colored by confidence_bucket
      map.addLayer({
        id: "crowns-fill",
        type: "fill",
        source: "crowns",
        paint: {
          "fill-color": [
            "match",
            ["get", "confidence_bucket"],
            "high",
            "#3a9b40",   // Green for high confidence
            "medium",
            "#c8a84b",   // Amber for medium confidence
            "low",
            "#c84b4b",   // Red for low confidence
            "#3a9b40",   // default
          ],
          "fill-opacity": 0.55,
        },
      });

      // 4. Line outline layer
      map.addLayer({
        id: "crowns-outline",
        type: "line",
        source: "crowns",
        paint: {
          "line-color": [
            "match",
            ["get", "confidence_bucket"],
            "high",
            "#4db854",
            "medium",
            "#dbbe5f",
            "low",
            "#e07070",
            "#4db854",
          ],
          "line-width": 1.5,
        },
      });

      // 5. Fit bounds to features or image bounds
      if (activeGeoJson.features.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
        for (const feat of activeGeoJson.features) {
          const geom = feat.geometry;
          if (geom.type === "Polygon") {
            for (const ring of geom.coordinates) {
              for (const coord of ring) {
                bounds.extend(coord as [number, number]);
              }
            }
          } else if (geom.type === "MultiPolygon") {
            for (const poly of geom.coordinates) {
              for (const ring of poly) {
                for (const coord of ring) {
                  bounds.extend(coord as [number, number]);
                }
              }
            }
          }
        }
        if (!bounds.isEmpty()) {
          map.fitBounds(bounds, { padding: 40, maxZoom: 19 });
        }
      } else if (summary.image_bounds) {
        map.fitBounds(
          [
            [summary.image_bounds.west, summary.image_bounds.south],
            [summary.image_bounds.east, summary.image_bounds.north],
          ],
          { padding: 40 }
        );
      }

      // 6. Click handler on crowns
      map.on("click", "crowns-fill", (e: MapMouseEvent & { features?: maplibregl.MapGeoJSONFeature[] }) => {
        if (!e.features || e.features.length === 0) return;
        const feat = e.features[0];
        const props = feat.properties as any;
        const coordinates = e.lngLat;

        const treeId = Number(props.tree_id);
        const areaM2 = props.area_m2 ? Number(props.area_m2).toFixed(1) : null;
        const areaPx = Number(props.area_px || 0).toFixed(0);
        const confPct = (Number(props.confidence) * 100).toFixed(1);
        const bucket = props.confidence_bucket || "medium";

        const badgeColor =
          bucket === "high" ? "#3a9b40" : bucket === "medium" ? "#c8a84b" : "#c84b4b";

        const popupHtml = `
          <div style="min-width: 180px; font-size: 0.8125rem;">
            <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 0.5rem;">
              <span style="font-weight: 700; color: var(--color-text); font-size: 0.875rem;">Tree #${treeId}</span>
              <span style="padding: 2px 6px; border-radius: 4px; font-size: 0.6875rem; font-weight: 600; background: ${badgeColor}22; color: ${badgeColor}; border: 1px solid ${badgeColor}55; text-transform: uppercase;">
                ${bucket}
              </span>
            </div>
            <div style="color: var(--color-muted); line-height: 1.6; margin-bottom: 0.75rem;">
              <div><strong>Confidence:</strong> <span style="color: var(--color-text);">${confPct}%</span></div>
              <div><strong>Area:</strong> <span style="color: var(--color-text);">${areaM2 ? `${areaM2} m²` : `${areaPx} px`}</span></div>
              ${props.on_tile_edge ? '<div style="color: var(--color-gold); font-size: 0.75rem;">⚠ On tile boundary</div>' : ''}
            </div>
            <button id="flag-btn-${treeId}" style="
              width: 100%;
              padding: 0.375rem 0.625rem;
              font-size: 0.75rem;
              font-weight: 500;
              border: 1px solid var(--color-error-b);
              background: rgba(200, 75, 75, 0.12);
              color: var(--color-error);
              border-radius: 6px;
              cursor: pointer;
              transition: all 150ms ease;
            ">
              ✕ Flag as incorrect
            </button>
          </div>
        `;

        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })
          .setLngLat(coordinates)
          .setHTML(popupHtml)
          .addTo(map);

        setTimeout(() => {
          const btn = document.getElementById(`flag-btn-${treeId}`);
          if (btn) {
            btn.onclick = () => {
              onFlagTree(treeId);
              popup.remove();
            };
          }
        }, 50);
      });

      // Cursor pointer on hover
      map.on("mouseenter", "crowns-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "crowns-fill", () => {
        map.getCanvas().style.cursor = "";
      });
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
  }, [isGeoreferenced, summary.image_bounds, imageUrl]);

  // Update GeoJSON source whenever active crowns change
  useEffect(() => {
    if (!mapInstanceRef.current || !isGeoreferenced) return;
    const map = mapInstanceRef.current;
    if (map.isStyleLoaded()) {
      const source = map.getSource("crowns") as GeoJSONSource | undefined;
      if (source) {
        source.setData(activeGeoJson);
      }
    }
  }, [activeGeoJson, isGeoreferenced]);

  // ─────────────────────────────────────────────────────────────────────────────
  // 2. NON-GEOREFERENCED (Plain Image with SVG Overlay)
  // ─────────────────────────────────────────────────────────────────────────────
  const imgWidth = summary.image_width || 1000;
  const imgHeight = summary.image_height || 1000;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "600px",
        borderRadius: "var(--radius-card)",
        overflow: "hidden",
        border: "1px solid var(--color-border)",
        background: "var(--color-surface)",
      }}
    >
      {isGeoreferenced ? (
        /* MapLibre instance container */
        <div ref={mapContainerRef} style={{ width: "100%", height: "100%" }} />
      ) : (
        /* Plain Image + SVG Overlay container */
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "#080e0a",
          }}
        >
          <div
            style={{
              position: "relative",
              maxWidth: "100%",
              maxHeight: "100%",
              aspectRatio: `${imgWidth} / ${imgHeight}`,
            }}
          >
            <img
              src={imageUrl}
              alt="Analyzed aerial raster preview"
              style={{
                display: "block",
                width: "100%",
                height: "100%",
                objectFit: "contain",
              }}
            />

            {/* SVG overlay for pixel coordinate polygons */}
            <svg
              viewBox={`0 0 ${imgWidth} ${imgHeight}`}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "auto",
              }}
            >
              {activeFeatures.map((feat) => {
                const geom = feat.geometry;
                const bucket = feat.properties.confidence_bucket;
                const strokeColor =
                  bucket === "high" ? "#4db854" : bucket === "medium" ? "#dbbe5f" : "#e07070";
                const fillColor =
                  bucket === "high"
                    ? "rgba(58, 155, 64, 0.45)"
                    : bucket === "medium"
                    ? "rgba(200, 168, 75, 0.45)"
                    : "rgba(200, 75, 75, 0.45)";

                // Convert Polygon coordinates to SVG path
                let pathData = "";
                if (geom.type === "Polygon") {
                  for (const ring of geom.coordinates) {
                    const d = ring
                      .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt[0]} ${pt[1]}`)
                      .join(" ");
                    pathData += `${d} Z `;
                  }
                }

                if (!pathData) return null;

                return (
                  <path
                    key={feat.properties.tree_id}
                    d={pathData}
                    fill={fillColor}
                    stroke={strokeColor}
                    strokeWidth={1.5}
                    style={{ cursor: "pointer", transition: "all 150ms ease" }}
                    onClick={(e) => {
                      const rect = (e.target as SVGElement).getBoundingClientRect();
                      setSelectedFeature(feat);
                      setPopupPos({ x: rect.left + rect.width / 2, y: rect.top });
                    }}
                  />
                );
              })}
            </svg>
          </div>

          {/* SVG Crown Click Modal/Popup */}
          {selectedFeature && popupPos && (
            <div
              style={{
                position: "fixed",
                left: popupPos.x,
                top: popupPos.y,
                transform: "translate(-50%, -100%) translateY(-10px)",
                background: "var(--color-surface-2)",
                border: "1px solid var(--color-border)",
                borderRadius: 8,
                padding: "0.875rem 1rem",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.5)",
                zIndex: 100,
                minWidth: 190,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
                <span style={{ fontWeight: 700, fontSize: "0.875rem" }}>
                  Tree #{selectedFeature.properties.tree_id}
                </span>
                <button
                  onClick={() => setSelectedFeature(null)}
                  style={{ background: "none", border: "none", color: "var(--color-muted)", cursor: "pointer" }}
                >
                  ✕
                </button>
              </div>
              <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.6, marginBottom: "0.75rem" }}>
                <div>Confidence: <strong style={{ color: "var(--color-text)" }}>{(selectedFeature.properties.confidence * 100).toFixed(1)}%</strong></div>
                <div>Area: <strong style={{ color: "var(--color-text)" }}>{selectedFeature.properties.area_px.toFixed(0)} px</strong></div>
              </div>
              <button
                className="btn-error"
                style={{ width: "100%", justifyContent: "center" }}
                onClick={() => {
                  onFlagTree(selectedFeature.properties.tree_id);
                  setSelectedFeature(null);
                }}
              >
                ✕ Flag as incorrect
              </button>
            </div>
          )}
        </div>
      )}

      {/* Floating Map Legend */}
      <div
        style={{
          position: "absolute",
          bottom: "1rem",
          left: "1rem",
          background: "rgba(24, 43, 27, 0.9)",
          backdropFilter: "blur(8px)",
          border: "1px solid var(--color-border)",
          borderRadius: 8,
          padding: "0.625rem 0.875rem",
          fontSize: "0.75rem",
          color: "var(--color-muted)",
          display: "flex",
          flexDirection: "column",
          gap: "0.375rem",
          zIndex: 10,
          pointerEvents: "auto",
        }}
      >
        <span style={{ fontWeight: 600, color: "var(--color-text)", letterSpacing: "0.02em" }}>
          Detection Confidence
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#3a9b40" }} />
          <span>High (&gt; 70%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c8a84b" }} />
          <span>Medium (40&ndash;70%)</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#c84b4b" }} />
          <span>Low (&lt; 40%)</span>
        </div>
      </div>
    </div>
  );
}
