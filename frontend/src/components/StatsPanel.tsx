/**
 * StatsPanel.tsx — Summary statistics, confidence breakdown bar, warnings, and badges
 *
 * Requirements:
 * 1. Tree count (large, primary number)
 * 2. Canopy area:
 *    - Show BOTH "Sum of crown areas" and "Union (non-overlapping) area" side by side
 *    - One-line explanation of why they differ (overlapping canopies counted once vs multiple times)
 * 3. Canopy cover % (union area / analyzed boundary area)
 * 4. Confidence breakdown as a horizontal stacked bar: high/medium/low counts
 * 5. If georeferenced is false:
 *    - Visible badge: "Pixel-based estimate — no real-world units available"
 * 6. Render any `warnings` from API as visible inline notices
 * 7. Show live correction line when trees are flagged:
 *    "Reviewed: X corrections applied — adjusted count: Y"
 */

import type { ResultSummary, TreeFeature } from "../lib/api";

interface StatsPanelProps {
  summary: ResultSummary;
  allFeatures: TreeFeature[];
  flaggedIds: Set<number>;
  onResetCorrections?: () => void;
}

export function StatsPanel({
  summary,
  allFeatures,
  flaggedIds,
  onResetCorrections,
}: StatsPanelProps) {
  const isGeoreferenced = summary.georeferenced;
  const flaggedCount = flaggedIds.size;

  // Active features after manual flags
  const activeFeatures = allFeatures.filter(
    (f) => !flaggedIds.has(f.properties.tree_id)
  );

  const baseCount = typeof summary.tree_count === "number" ? summary.tree_count : activeFeatures.length;
  const adjustedTreeCount = Math.max(0, baseCount - flaggedCount);

  // Recompute confidence breakdown based on active crowns
  const confidenceBreakdown = activeFeatures.reduce(
    (acc, f) => {
      const bucket = f.properties.confidence_bucket;
      if (bucket === "high") acc.high += 1;
      else if (bucket === "medium") acc.medium += 1;
      else if (bucket === "low") acc.low += 1;
      return acc;
    },
    { high: 0, medium: 0, low: 0 }
  );

  // Compute recomputed sum area
  let adjustedSumAreaM2: number | null = null;
  let adjustedSumAreaPx: number | null = null;

  if (isGeoreferenced) {
    adjustedSumAreaM2 = activeFeatures.reduce(
      (sum, f) => sum + (f.properties.area_m2 || 0),
      0
    );
  } else {
    adjustedSumAreaPx = activeFeatures.reduce(
      (sum, f) => sum + (f.properties.area_px || 0),
      0
    );
  }

  // Union area ratio factor estimation for client-side corrections
  const initialCount = allFeatures.length || 1;
  const countFactor = adjustedTreeCount / initialCount;

  const adjustedUnionAreaM2 =
    summary.union_area_m2 !== null && summary.union_area_m2 !== undefined
      ? summary.union_area_m2 * countFactor
      : null;

  const adjustedUnionAreaPx =
    summary.union_area_px !== null && summary.union_area_px !== undefined
      ? summary.union_area_px * countFactor
      : null;

  const adjustedCanopyCoverPct =
    summary.canopy_cover_percent !== null && summary.canopy_cover_percent !== undefined
      ? Math.max(0, Number((summary.canopy_cover_percent * countFactor).toFixed(1)))
      : null;

  // Stacked confidence bar percentages
  const totalConf =
    confidenceBreakdown.high + confidenceBreakdown.medium + confidenceBreakdown.low || 1;
  const pctHigh = Math.round((confidenceBreakdown.high / totalConf) * 100);
  const pctMed = Math.round((confidenceBreakdown.medium / totalConf) * 100);
  const pctLow = 100 - pctHigh - pctMed;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* ── Status / Non-georeferenced Badge & Corrections Notice ── */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
        {!isGeoreferenced && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.375rem 0.75rem",
              borderRadius: 6,
              background: "rgba(200, 168, 75, 0.12)",
              border: "1px solid var(--color-gold)",
              color: "var(--color-gold)",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            <span>⚠</span>
            <span>Pixel-based estimate — no real-world units available</span>
          </div>
        )}

        {flaggedCount > 0 && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.375rem 0.75rem",
              borderRadius: 6,
              background: "rgba(77, 184, 84, 0.12)",
              border: "1px solid var(--color-green)",
              color: "var(--color-green-h)",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            <span>✓</span>
            <span>
              Reviewed: <strong>{flaggedCount}</strong> {flaggedCount === 1 ? "correction" : "corrections"} applied — adjusted count: <strong>{adjustedTreeCount}</strong>
            </span>
            {onResetCorrections && (
              <button
                onClick={onResetCorrections}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-muted)",
                  textDecoration: "underline",
                  cursor: "pointer",
                  fontSize: "0.75rem",
                  marginLeft: "0.25rem",
                }}
              >
                Reset
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Warnings list (rendered inline, not buried) ── */}
      {summary.warnings && summary.warnings.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {summary.warnings.map((warn, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.5rem",
                padding: "0.5rem 0.75rem",
                borderRadius: 6,
                background: "rgba(200, 168, 75, 0.08)",
                borderLeft: "3px solid var(--color-gold)",
                fontSize: "0.8125rem",
                color: "#e8cf8d",
              }}
            >
              <span style={{ color: "var(--color-gold)", flexShrink: 0 }}>ℹ</span>
              <span>{warn}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Primary Metric Grid ── */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Tree Count Card */}
        <div
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>
            Detected Trees
          </span>
          <div style={{ margin: "0.5rem 0 0.25rem" }}>
            <span
              style={{
                fontSize: "2.75rem",
                fontWeight: 700,
                color: "var(--color-text)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {adjustedTreeCount.toLocaleString()}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>
            Individual tree crowns detected
          </span>
        </div>

        {/* Canopy Cover Card */}
        <div
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>
            Canopy Cover
          </span>
          <div style={{ margin: "0.5rem 0 0.25rem" }}>
            <span
              style={{
                fontSize: "2.75rem",
                fontWeight: 700,
                color: "var(--color-green-h)",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              {adjustedCanopyCoverPct !== null ? `${adjustedCanopyCoverPct}%` : "N/A"}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>
            Union canopy / analyzed boundary
          </span>
        </div>

        {/* Sum of Crown Areas */}
        <div
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>
            Sum of Crown Areas
          </span>
          <div style={{ margin: "0.5rem 0 0.25rem" }}>
            <span style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--color-text)" }}>
              {isGeoreferenced && adjustedSumAreaM2 !== null
                ? `${adjustedSumAreaM2 >= 10000 ? (adjustedSumAreaM2 / 10000).toFixed(2) : adjustedSumAreaM2.toFixed(1)}`
                : `${(adjustedSumAreaPx || 0).toLocaleString()}`}
            </span>
            <span style={{ fontSize: "0.9375rem", color: "var(--color-muted)", marginLeft: "0.25rem" }}>
              {isGeoreferenced && adjustedSumAreaM2 !== null
                ? adjustedSumAreaM2 >= 10000 ? "ha" : "m²"
                : "px"}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>
            Individual crowns summed directly
          </span>
        </div>

        {/* Union (Non-Overlapping) Area */}
        <div
          style={{
            background: "var(--color-surface-2)",
            border: "1px solid var(--color-border)",
            borderRadius: 10,
            padding: "1.25rem",
            display: "flex",
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontSize: "0.8125rem", color: "var(--color-muted)", fontWeight: 500 }}>
            Union (Non-overlapping) Area
          </span>
          <div style={{ margin: "0.5rem 0 0.25rem" }}>
            <span style={{ fontSize: "1.875rem", fontWeight: 700, color: "var(--color-text)" }}>
              {isGeoreferenced && adjustedUnionAreaM2 !== null
                ? `${adjustedUnionAreaM2 >= 10000 ? (adjustedUnionAreaM2 / 10000).toFixed(2) : adjustedUnionAreaM2.toFixed(1)}`
                : `${(adjustedUnionAreaPx || 0).toLocaleString()}`}
            </span>
            <span style={{ fontSize: "0.9375rem", color: "var(--color-muted)", marginLeft: "0.25rem" }}>
              {isGeoreferenced && adjustedUnionAreaM2 !== null
                ? adjustedUnionAreaM2 >= 10000 ? "ha" : "m²"
                : "px"}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>
            Geometric dissolve removing overlap
          </span>
        </div>
      </div>

      {/* Explicit One-Line Explanation of Area Difference */}
      <div
        style={{
          background: "rgba(15, 26, 18, 0.6)",
          border: "1px dashed var(--color-border)",
          borderRadius: 8,
          padding: "0.75rem 1rem",
          fontSize: "0.8125rem",
          color: "var(--color-muted)",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
        }}
      >
        <span style={{ color: "var(--color-green)" }}>💡</span>
        <span>
          <strong>Why do Sum and Union areas differ?</strong> Overlapping crowns are counted multiple times in the <em>Sum</em>, whereas <em>Union Area</em> merges touching canopies so overlapping foliage is calculated exactly once.
        </span>
      </div>

      {/* ── Confidence Breakdown Stacked Bar ── */}
      <div
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)" }}>
            Confidence Distribution
          </span>
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.75rem" }}>
            <span style={{ color: "#4db854" }}>
              ● High: <strong>{confidenceBreakdown.high}</strong> ({pctHigh}%)
            </span>
            <span style={{ color: "#dbbe5f" }}>
              ● Med: <strong>{confidenceBreakdown.medium}</strong> ({pctMed}%)
            </span>
            <span style={{ color: "#e07070" }}>
              ● Low: <strong>{confidenceBreakdown.low}</strong> ({pctLow}%)
            </span>
          </div>
        </div>

        {/* Horizontal Stacked Bar */}
        <div
          style={{
            height: 12,
            width: "100%",
            borderRadius: 6,
            overflow: "hidden",
            display: "flex",
            background: "rgba(0,0,0,0.3)",
          }}
        >
          <div
            style={{
              width: `${pctHigh}%`,
              background: "#3a9b40",
              transition: "width 300ms ease",
            }}
            title={`High Confidence: ${confidenceBreakdown.high} (${pctHigh}%)`}
          />
          <div
            style={{
              width: `${pctMed}%`,
              background: "#c8a84b",
              transition: "width 300ms ease",
            }}
            title={`Medium Confidence: ${confidenceBreakdown.medium} (${pctMed}%)`}
          />
          <div
            style={{
              width: `${pctLow}%`,
              background: "#c84b4b",
              transition: "width 300ms ease",
            }}
            title={`Low Confidence: ${confidenceBreakdown.low} (${pctLow}%)`}
          />
        </div>
      </div>
    </div>
  );
}
