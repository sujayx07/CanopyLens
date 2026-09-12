/**
 * ExportBar.tsx — Sticky bottom export bar for GeoJSON and CSV downloads
 *
 * Requirements:
 * 1. Sticky, always visible on the Results screen
 * 2. Direct download links: "Download GeoJSON" and "Download CSV" hitting export endpoints
 * 3. Shows active job identifier and quick button to analyze another image
 */

import { getGeoJsonExportUrl, getCsvExportUrl } from "../lib/api";

interface ExportBarProps {
  jobId: string;
  onReset: () => void;
  adjustedCount: number;
}

export function ExportBar({ jobId, onReset, adjustedCount }: ExportBarProps) {
  const geoJsonUrl = getGeoJsonExportUrl(jobId);
  const csvUrl = getCsvExportUrl(jobId);

  return (
    <footer
      style={{
        position: "sticky",
        bottom: 0,
        zIndex: 50,
        width: "100%",
        padding: "1rem 2rem",
        background: "rgba(15, 26, 18, 0.92)",
        backdropFilter: "blur(12px)",
        borderTop: "1px solid var(--color-border)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "1rem",
        boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.35)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <button
          onClick={onReset}
          className="btn-ghost"
          style={{ fontSize: "0.8125rem", padding: "0.5rem 0.875rem" }}
        >
          ↺ New Analysis
        </button>
        <div style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>
          Exporting dataset for Job{" "}
          <code style={{ color: "var(--color-text)", fontWeight: 600 }}>
            {jobId.slice(0, 8)}…
          </code>{" "}
          ({adjustedCount} crowns)
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <a
          href={geoJsonUrl}
          download={`canopylens_${jobId}.geojson`}
          className="btn-ghost"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
            fontSize: "0.875rem",
            color: "var(--color-text)",
            borderColor: "var(--color-border-h)",
            padding: "0.625rem 1.125rem",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 11V3M4 7l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M2 13h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          Download GeoJSON
        </a>

        <a
          href={csvUrl}
          download={`canopylens_${jobId}.csv`}
          className="btn-primary"
          style={{
            width: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: "0.5rem",
            textDecoration: "none",
            fontSize: "0.875rem",
            padding: "0.625rem 1.25rem",
          }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M8 11V3M4 7l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path d="M2 13h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
          </svg>
          Download CSV
        </a>
      </div>
    </footer>
  );
}
