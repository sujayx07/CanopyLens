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

  // Base raw sums from segmented features or backend summary
  const rawSumAreaM2 = isGeoreferenced
    ? (summary.sum_area_m2 ?? activeFeatures.reduce((sum, f) => sum + (f.properties.area_m2 || 0), 0))
    : null;
  const rawSumAreaPx = !isGeoreferenced
    ? (summary.sum_area_px ?? activeFeatures.reduce((sum, f) => sum + (f.properties.area_px || 0), 0))
    : null;

  // Raw union areas
  const rawUnionAreaM2 = summary.union_area_m2 ?? rawSumAreaM2;
  const rawUnionAreaPx = summary.union_area_px ?? rawSumAreaPx;

  // Proportional scaling for manual corrections or verified tree count
  const initialCount = allFeatures.length || 1;
  const activeRatio = allFeatures.length > 0 ? activeFeatures.length / initialCount : 1.0;
  const countFactor = adjustedTreeCount / initialCount;
  const scale = flaggedCount > 0 ? activeRatio : countFactor;

  let adjustedSumAreaM2 = rawSumAreaM2 !== null ? rawSumAreaM2 * scale : null;
  let adjustedSumAreaPx = rawSumAreaPx !== null ? rawSumAreaPx * scale : null;

  let adjustedUnionAreaM2 = rawUnionAreaM2 !== null ? rawUnionAreaM2 * scale : null;
  let adjustedUnionAreaPx = rawUnionAreaPx !== null ? rawUnionAreaPx * scale : null;

  // Geometric constraint: Union area cannot exceed Sum area
  if (adjustedSumAreaM2 !== null && adjustedUnionAreaM2 !== null) {
    adjustedUnionAreaM2 = Math.min(adjustedUnionAreaM2, adjustedSumAreaM2);
  }
  if (adjustedSumAreaPx !== null && adjustedUnionAreaPx !== null) {
    adjustedUnionAreaPx = Math.min(adjustedUnionAreaPx, adjustedSumAreaPx);
  }

  const adjustedCanopyCoverPct =
    summary.canopy_cover_percent !== null && summary.canopy_cover_percent !== undefined
      ? Math.max(0, Number((summary.canopy_cover_percent * scale).toFixed(1)))
      : null;

  const currentSumArea = isGeoreferenced ? adjustedSumAreaM2 : adjustedSumAreaPx;
  const currentUnionArea = isGeoreferenced ? adjustedUnionAreaM2 : adjustedUnionAreaPx;
  const overlapArea = (currentSumArea !== null && currentUnionArea !== null)
    ? Math.max(0, currentSumArea - currentUnionArea)
    : 0;
  const overlapPct = (currentSumArea !== null && currentSumArea > 0)
    ? Math.max(0, Math.min(100, (overlapArea / currentSumArea) * 100))
    : 0;
  const hasOverlap = overlapArea > 0.5 && overlapPct >= 0.1;
  const areaUnit = isGeoreferenced ? (currentSumArea && currentSumArea >= 10000 ? "ha" : "m²") : "px";

  const formatArea = (val: number | null): string => {
    if (val === null || val === undefined) return "0";
    if (isGeoreferenced) {
      return val >= 10000 ? (val / 10000).toFixed(2) : val.toFixed(1);
    }
    return Math.round(val).toLocaleString();
  };

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
            <span>Pixel Space Mode</span>
            <span style={{ fontSize: "0.75rem", opacity: 0.85 }}>
              (Uncalibrated image; areas in px, canopy cover N/A)
            </span>
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
              background: "rgba(220, 53, 69, 0.15)",
              border: "1px solid #e55353",
              color: "#ff6b6b",
              fontSize: "0.8125rem",
              fontWeight: 500,
            }}
          >
            <span>
              {flaggedCount} {flaggedCount === 1 ? "tree" : "trees"} flagged as false positive
            </span>
            {onResetCorrections && (
              <button
                onClick={onResetCorrections}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-gold)",
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
              {formatArea(currentSumArea)}
            </span>
            <span style={{ fontSize: "0.9375rem", color: "var(--color-muted)", marginLeft: "0.25rem" }}>
              {areaUnit}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: "var(--color-faint)" }}>
            {adjustedTreeCount > 1
              ? `Direct sum of ${adjustedTreeCount} crown spreads`
              : "Individual crown spread"}
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
            <span style={{ fontSize: "1.875rem", fontWeight: 700, color: hasOverlap ? "var(--color-green-h)" : "var(--color-text)" }}>
              {formatArea(currentUnionArea)}
            </span>
            <span style={{ fontSize: "0.9375rem", color: "var(--color-muted)", marginLeft: "0.25rem" }}>
              {areaUnit}
            </span>
          </div>
          <span style={{ fontSize: "0.75rem", color: hasOverlap ? "var(--color-green-h)" : "var(--color-faint)" }}>
            {hasOverlap
              ? `${overlapPct.toFixed(1)}% canopy overlap dissolved`
              : "0% overlap — isolated canopy footprint"}
          </span>
        </div>
      </div>

      {/* Explicit One-Line Explanation of Area Difference / Overlap */}
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
        <span style={{ color: "var(--color-green)", flexShrink: 0 }}>
          {hasOverlap ? "💡" : "ℹ️"}
        </span>
        <span>
          {hasOverlap ? (
            <>
              <strong>Canopy overlap detected:</strong> {overlapPct.toFixed(1)}% ({formatArea(overlapArea)} {areaUnit}) of foliage is shared between touching crowns. <em>Sum</em> totals individual tree crown spreads, while <em>Union</em> dissolves overlapping foliage into the true ground canopy footprint.
            </>
          ) : (
            <>
              <strong>Zero canopy overlap:</strong> <em>Sum</em> and <em>Union</em> areas are identical because all detected tree crowns in this scene are spatially isolated with no touching or overlapping canopies.
            </>
          )}
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
