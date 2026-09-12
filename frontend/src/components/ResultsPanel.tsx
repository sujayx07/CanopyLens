/**
 * ResultsPanel.tsx — Complete Results screen for CanopyLens
 *
 * Requirements:
 * 1. Fetches GET /jobs/{jobId}/result with React Query
 * 2. Full-width MapView (MapLibre GL or SVG overlay)
 * 3. StatsPanel with live recomputation of flagged trees
 * 4. Permanent LimitationsPanel with honest scientific bounds
 * 5. Sticky ExportBar with download buttons
 * 6. "Flag as incorrect" interaction with live count updates
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { getJobResult, type JobResult } from "../lib/api";
import { MapView } from "./MapView";
import { StatsPanel } from "./StatsPanel";
import { LimitationsPanel } from "./LimitationsPanel";
import { ExportBar } from "./ExportBar";
import { IndeterminateRing } from "./IndeterminateRing";

interface ResultsPanelProps {
  jobId: string;
  onReset: () => void;
}

export function ResultsPanel({ jobId, onReset }: ResultsPanelProps) {
  const [flaggedIds, setFlaggedIds] = useState<Set<number>>(new Set());

  const { data, isLoading, error } = useQuery<JobResult, Error>({
    queryKey: ["jobResult", jobId],
    queryFn: () => getJobResult(jobId),
    staleTime: Infinity,
    retry: 2,
  });

  const handleFlagTree = useCallback((treeId: number) => {
    setFlaggedIds((prev) => {
      const next = new Set(prev);
      next.add(treeId);
      return next;
    });
  }, []);

  const handleResetCorrections = useCallback(() => {
    setFlaggedIds(new Set());
  }, []);

  if (isLoading) {
    return (
      <div
        className="fade-in"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "400px",
          gap: "1.5rem",
          padding: "3rem 1rem",
        }}
      >
        <IndeterminateRing size={72} strokeWidth={5} />
        <div style={{ textAlign: "center" }}>
          <p style={{ fontWeight: 600, fontSize: "1.125rem", color: "var(--color-text)" }}>
            Loading Analysis Results…
          </p>
          <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginTop: "0.25rem" }}>
            Preparing crown geometries and area statistics
          </p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="error-card fade-in" style={{ padding: "2rem", textAlign: "center" }}>
        <span style={{ fontSize: "2rem", color: "var(--color-error)" }}>⚠</span>
        <h3 style={{ fontSize: "1.125rem", color: "var(--color-error)", margin: "0.5rem 0" }}>
          Failed to load results
        </h3>
        <p style={{ fontSize: "0.875rem", color: "var(--color-muted)", marginBottom: "1.5rem" }}>
          {error?.message || "Could not retrieve the analysis dataset."}
        </p>
        <button className="btn-error" onClick={onReset}>
          ↺ Start Over
        </button>
      </div>
    );
  }

  const features = data.features || [];
  const summary = data.summary;
  const activeCount = features.length - flaggedIds.size;

  return (
    <div
      className="fade-in"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        width: "100%",
        paddingBottom: "2rem",
      }}
    >
      {/* ── Top Summary & Stats Panel ── */}
      <StatsPanel
        summary={summary}
        allFeatures={features}
        flaggedIds={flaggedIds}
        onResetCorrections={handleResetCorrections}
      />

      {/* ── Interactive Map / Overlay ── */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <h2 style={{ fontSize: "1.125rem", fontWeight: 600, color: "var(--color-text)" }}>
            Spatial Crown Detections
          </h2>
          <span style={{ fontSize: "0.75rem", color: "var(--color-muted)" }}>
            Click any crown to inspect metrics or flag as incorrect
          </span>
        </div>

        <MapView
          jobId={jobId}
          features={features}
          summary={summary}
          onFlagTree={handleFlagTree}
          flaggedIds={flaggedIds}
        />
      </div>

      {/* ── Permanent Transparency & Limitations Panel ── */}
      <LimitationsPanel />

      {/* ── Sticky Bottom Export Bar ── */}
      <ExportBar
        jobId={jobId}
        onReset={onReset}
        adjustedCount={activeCount}
      />
    </div>
  );
}
