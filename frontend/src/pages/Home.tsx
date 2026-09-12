/**
 * Home.tsx — CanopyLens single-page experience
 *
 * State machine:
 *   "upload"     → user fills form and clicks Analyze
 *   "processing" → job has been created, polling GET /jobs/{id}
 *   "done"       → job completed (transitions to results in next prompt)
 *
 * No route changes — just conditional rendering.
 */
import { useState, useCallback } from "react";
import { UploadPanel } from "../components/UploadPanel";
import { ProcessingPanel } from "../components/ProcessingPanel";
import { ResultsPanel } from "../components/ResultsPanel";

type AppState =
  | { phase: "upload" }
  | { phase: "processing"; jobId: string; startedAt: Date }
  | { phase: "done"; jobId: string };

// ── Brand logo ────────────────────────────────────────────────────────────────

function LeafIcon() {
  return (
    <svg
      width="28" height="28" viewBox="0 0 28 28" fill="none"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      <path
        d="M14 3C14 3 5 7 5 16c0 4.97 4.03 9 9 9s9-4.03 9-9c0-3-1.2-5.73-3.16-7.73"
        stroke="var(--color-green)" strokeWidth="2" strokeLinecap="round"
      />
      <path
        d="M14 25V13M14 13c0 0-3-3-6-3"
        stroke="var(--color-green)" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round"
      />
      <path
        d="M14 18c0 0 2.5-2 5-2"
        stroke="var(--color-green-h)" strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState] = useState<AppState>(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const urlJobId = params.get("jobId");
      if (urlJobId) {
        return { phase: "done", jobId: urlJobId };
      }
    } catch {
      /* ignore */
    }
    return { phase: "upload" };
  });

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
      window.history.replaceState({}, "", url.pathname);
    } catch {
      /* ignore */
    }
    setState({ phase: "upload" });
  }, []);

  const phase = state.phase;

  return (
    /* full-page layout */
    <div
      className="noise-overlay"
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        position: "relative",
        zIndex: 1,
      }}
    >
      {/* ── Header ──────────────────────────────────────────── */}
      <header
        style={{
          padding: "1.25rem 2rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: "1px solid var(--color-border)",
          backdropFilter: "blur(8px)",
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "rgba(15, 26, 18, 0.85)",
        }}
      >
        <a
          href="/"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.625rem",
            textDecoration: "none",
          }}
        >
          <LeafIcon />
          <span style={{ fontSize: "1.125rem", fontWeight: 700, letterSpacing: "-0.02em" }}>
            <span style={{ color: "var(--color-text)" }}>Canopy</span>
            <span style={{ color: "var(--color-green)" }}>Lens</span>
          </span>
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
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
            maxWidth: phase === "done" ? 1180 : 560,
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
                color: "var(--color-text)",
                letterSpacing: "-0.03em",
                marginBottom: "0.375rem",
              }}
            >
              {phase === "upload" && "Analyze Canopy Cover"}
              {phase === "processing" && "Running Analysis…"}
              {phase === "done" && "Canopy Analysis Results"}
            </h1>
            <p style={{ fontSize: "0.9rem", color: "var(--color-muted)" }}>
              {phase === "upload" &&
                "Upload an aerial or satellite image to detect tree crowns and measure canopy area."}
              {phase === "processing" &&
                "Your image is being processed on a GPU worker. This typically takes 2–5 minutes."}
              {phase === "done" &&
                "Interactive spatial crown maps, metrics, and dataset exports."}
            </p>
          </div>

          {/* Card / View Container */}
          <div
            className={phase === "done" ? "" : "card"}
            style={{ position: "relative" }}
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

          {/* ── Footer note ──────────────────────────────────── */}
          <p
            style={{
              textAlign: "center",
              fontSize: "0.75rem",
              color: "var(--color-faint)",
              marginTop: "2rem",
            }}
          >
            Processing happens server-side. Uploads are not stored after analysis.
          </p>
        </div>
      </main>

      {/* ── Ambient background gradients ──────────────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: -1,
          pointerEvents: "none",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: "-20%",
            left: "-10%",
            width: "60%",
            height: "60%",
            background:
              "radial-gradient(ellipse, rgba(58,155,64,0.07) 0%, transparent 70%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: "-10%",
            right: "-5%",
            width: "50%",
            height: "50%",
            background:
              "radial-gradient(ellipse, rgba(200,168,75,0.05) 0%, transparent 70%)",
          }}
        />
      </div>
    </div>
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
          <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.5"
                strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : label}
    </div>
  );
}
