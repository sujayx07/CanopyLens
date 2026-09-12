/**
 * Home.tsx — CanopyLens Experience: Landing Page + Studio Workspace
 *
 * State machine:
 *   "landing"    → Typographic landing page with interactive studio inspector & workflow
 *   "upload"     → Direct workspace upload state (file drop & KML boundary)
 *   "processing" → GPU job polling
 *   "done"       → Full MapLibre results view with interactive tree polygons & exports
 */
import { useState, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { UploadPanel } from "../components/UploadPanel";
import { ProcessingPanel } from "../components/ProcessingPanel";
import { ResultsPanel } from "../components/ResultsPanel";
import { LandingPage } from "../components/LandingPage";

export type AppState =
  | { phase: "landing" }
  | { phase: "upload" }
  | { phase: "processing"; jobId: string; startedAt: Date }
  | { phase: "done"; jobId: string };

interface HomeProps {
  initialPhase?: "landing" | "upload" | "done";
  initialJobId?: string;
}

// ── Brand logo ────────────────────────────────────────────────────────────────

function LeafIcon() {
  return (
    <svg
      width="28" height="28" viewBox="0 0 28 28" fill="none"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      <path
        d="M14 3C14 3 5 7 5 16c0 4.97 4.03 9 9 9s9-4.03 9-9c0-3-1.2-5.73-3.16-7.73"
        stroke="#10B981" strokeWidth="2" strokeLinecap="round"
      />
      <path
        d="M14 25V13M14 13c0 0-3-3-6-3"
        stroke="#10B981" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M14 18c0 0 2.5-2 5-2"
        stroke="#6EE7B7" strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Phase pip indicator ───────────────────────────────────────────────────────

function PhasePip({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div
      style={{
        width: 22,
        height: 22,
        borderRadius: "50%",
        border: done
          ? "none"
          : `1.5px solid ${active ? "var(--color-green)" : "var(--color-border)"}`,
        background: done ? "var(--color-green)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: "0.6875rem",
        fontWeight: 600,
        color: done ? "white" : active ? "var(--color-green)" : "var(--color-faint)",
        transition: "all 300ms ease",
      }}
      aria-hidden="true"
    >
      {done ? (
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
          <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : label}
    </div>
  );
}

// ── Main Home Component ───────────────────────────────────────────────────────

export default function Home({ initialPhase, initialJobId }: HomeProps) {
  const routeParams = useParams<{ jobId?: string }>();

  const [state, setState] = useState<AppState>(() => {
    // 1. Check props
    const targetJobId = initialJobId || routeParams.jobId;
    if (targetJobId) {
      return { phase: "done", jobId: targetJobId };
    }
    if (initialPhase === "upload") {
      return { phase: "upload" };
    }

    // 2. Check query params
    try {
      const params = new URLSearchParams(window.location.search);
      const urlJobId = params.get("jobId");
      if (urlJobId) {
        return { phase: "done", jobId: urlJobId };
      }
      const view = params.get("view");
      if (view === "workspace" || view === "upload") {
        return { phase: "upload" };
      }
      if (view === "demo") {
        return { phase: "done", jobId: "demo-pacific-nw" };
      }
    } catch {
      /* ignore */
    }

    // 3. Default to the landing page
    return { phase: "landing" };
  });

  // Keep state synced if routeParams change
  useEffect(() => {
    if (routeParams.jobId) {
      setState({ phase: "done", jobId: routeParams.jobId });
    }
  }, [routeParams.jobId]);

  const handleJobCreated = useCallback((jobId: string, startedAt: Date) => {
    setState({ phase: "processing", jobId, startedAt });
  }, []);

  const handleComplete = useCallback((jobId: string) => {
    setState({ phase: "done", jobId });
  }, []);

  const handleReset = useCallback(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("jobId");
      url.searchParams.delete("view");
      window.history.replaceState({}, "", url.pathname);
    } catch {
      /* ignore */
    }
    setState({ phase: "landing" });
  }, []);

  const phase = state.phase;

  // ── 1. LANDING PAGE VIEW ────────────────────────────────────────────────────
  if (phase === "landing") {
    return (
      <LandingPage
        onLaunchWorkspace={() => {
          const el = document.getElementById("workspace");
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
          } else {
            setState({ phase: "upload" });
          }
        }}
        onExploreDemo={() => setState({ phase: "done", jobId: "demo-pacific-nw" })}
        onLoadSample={() => {
          const el = document.getElementById("workspace");
          if (el) {
            el.scrollIntoView({ behavior: "smooth" });
          } else {
            setState({ phase: "upload" });
          }
        }}
        onJobCreated={handleJobCreated}
      />
    );
  }

  // ── 2. STUDIO WORKSPACE VIEW (Upload / Processing / Results) ─────────────────
  return (
    <div
      className="noise-overlay"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
        backgroundColor: "#0A0F0D",
      }}
    >
      {/* ── Studio Header ────────────────────────────────────────── */}
      <header
        style={{
          padding: "1rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid #262B29",
          backdropFilter: "blur(12px)",
          position: "sticky",
          top: 0,
          zIndex: 40,
          background: "rgba(10, 15, 13, 0.92)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem" }}>
          <button
            type="button"
            onClick={() => setState({ phase: "landing" })}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              background: "#181D1A",
              border: "1px solid #3C4A42",
              color: "#6EE7B7",
              padding: "0.35rem 0.75rem",
              borderRadius: "6px",
              fontSize: "0.75rem",
              cursor: "pointer",
              fontFamily: "monospace",
              transition: "all 150ms ease",
            }}
          >
            ← Platform Overview
          </button>

          <a
            href="/"
            onClick={(e) => {
              e.preventDefault();
              setState({ phase: "landing" });
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.625rem",
              textDecoration: "none",
            }}
          >
            <LeafIcon />
            <span style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em", fontFamily: "Space Grotesk, sans-serif" }}>
              <span style={{ color: "#F8FAFC" }}>Canopy</span>
              <span style={{ color: "#10B981" }}>Lens</span>
            </span>
          </a>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          {phase !== "done" && (
            <button
              type="button"
              onClick={() => setState({ phase: "done", jobId: "demo-pacific-nw" })}
              style={{
                background: "transparent",
                border: "1px solid #2D5A30",
                color: "#6EE7B7",
                fontSize: "0.75rem",
                padding: "0.35rem 0.75rem",
                borderRadius: "6px",
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              ⚡ Load Sample Demo
            </button>
          )}

          {/* Phase indicator */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              fontSize: "0.8125rem",
              color: "var(--color-muted)",
            }}
          >
            <PhasePip active={phase === "upload"} done={phase !== "upload"} label="1" />
            <span style={{ color: "var(--color-faint)" }}>–</span>
            <PhasePip active={phase === "processing"} done={phase === "done"} label="2" />
            <span style={{ color: "var(--color-faint)" }}>–</span>
            <PhasePip active={phase === "done"} done={false} label="3" />
          </div>
        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: phase === "done" ? "2rem 2rem 5rem" : "3rem 1.5rem 4rem",
          transition: "padding 300ms ease",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: phase === "done" ? 1180 : 580,
            display: "flex",
            flexDirection: "column",
            gap: "0",
            transition: "max-width 300ms ease",
          }}
        >
          {/* Card header */}
          <div style={{ marginBottom: phase === "done" ? "1.5rem" : "2rem" }}>
            <h1
              style={{
                fontSize: phase === "done" ? "1.75rem" : "1.625rem",
                fontWeight: 700,
                color: "#F8FAFC",
                letterSpacing: "-0.03em",
                marginBottom: "0.375rem",
                fontFamily: "Space Grotesk, sans-serif",
              }}
            >
              {phase === "upload" && "Analyze Canopy Cover"}
              {phase === "processing" && "Running Deep Learning Pipeline…"}
              {phase === "done" && "Canopy Analysis Results"}
            </h1>
            <p style={{ fontSize: "0.9rem", color: "#94A3B8" }}>
              {phase === "upload" &&
                "Upload an aerial or satellite image to detect tree crowns and measure non-overlapping canopy cover."}
              {phase === "processing" &&
                "Your image is being processed on a GPU worker. DeepForest and SAM2 are generating crown vectors."}
              {phase === "done" &&
                "Interactive spatial crown maps, area metrics, and GIS vector exports."}
            </p>
          </div>

          {/* Card / View Container */}
          <div
            className={phase === "done" ? "" : "card"}
            style={{
              position: "relative",
              backgroundColor: phase === "done" ? "transparent" : "#0F1A12",
              borderColor: "#262B29",
            }}
          >
            {phase === "upload" && (
              <UploadPanel onJobCreated={handleJobCreated} />
            )}

            {phase === "processing" && state.phase === "processing" && (
              <ProcessingPanel
                jobId={state.jobId}
                startedAt={state.startedAt}
                onComplete={handleComplete}
                onReset={handleReset}
              />
            )}

            {phase === "done" && state.phase === "done" && (
              <ResultsPanel jobId={state.jobId} onReset={handleReset} />
            )}
          </div>

          {/* Footer note */}
          <p
            style={{
              textAlign: "center",
              fontSize: "0.75rem",
              color: "#7AAA80",
              marginTop: "2rem",
              fontFamily: "monospace",
            }}
          >
            Inference powered by DeepForest & Meta SAM2 on Modal GPU T4.
          </p>
        </div>
      </main>
    </div>
  );
}
