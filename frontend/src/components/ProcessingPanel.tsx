/**
 * ProcessingPanel.tsx — polling + progress state (Screen 2)
 *
 * Uses React Query's `useQuery` with `refetchInterval` to poll
 * GET /jobs/{jobId} every 2 s. Stops polling automatically when
 * status reaches "done" or "failed".
 *
 * - Shows an indeterminate progress ring + elapsed time
 * - If status == "failed": shows the actual error from the API in a dismissable
 *   error card with a "Try again" button — never leaves the user on an infinite spinner
 * - When status == "done": calls onComplete so the parent can transition to results
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError, getJobStatus } from "../lib/api";
import { IndeterminateRing } from "./IndeterminateRing";
import { useElapsedTime } from "../lib/useElapsedTime";

// Status label shown below the progress ring
const STATUS_LABELS: Record<string, string> = {
  queued:     "Queued — waiting for a GPU worker…",
  processing: "Running tree crown detection…",
  done:       "Analysis complete!",
  failed:     "Analysis failed",
};

interface ProcessingPanelProps {
  jobId: string;
  startedAt: Date;
  onComplete: (jobId: string) => void;
  onReset: () => void;
}

export function ProcessingPanel({
  jobId,
  startedAt,
  onComplete,
  onReset,
}: ProcessingPanelProps) {
  const [dismissed, setDismissed] = useState(false);
  const elapsed = useElapsedTime(startedAt);

  const { data, error, isError } = useQuery({
    queryKey: ["job", jobId],
    queryFn: () => getJobStatus(jobId),
    // Poll every 2 s; stop automatically when done or failed
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status === "done" || status === "failed") return false;
      return 2000;
    },
    retry: 3,           // retry transient network errors
    retryDelay: 1500,
  });

  const status = data?.status ?? "queued";
  const apiError = data?.error ?? null;

  // Transition to results once done
  if (status === "done" && !dismissed) {
    // Small timeout so the user sees "complete" briefly before transition
    setTimeout(() => onComplete(jobId), 600);
  }

  const isFailed = status === "failed";
  const isNetworkError = isError;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.75rem" }}>

      {/* ── Progress card ─────────────────────────────────── */}
      <div
        style={{
          background: "var(--color-surface-2)",
          border: "1px solid var(--color-border)",
          borderRadius: 10,
          padding: "2rem 1.75rem",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "1.5rem",
          textAlign: "center",
        }}
      >
        {/* Ring + time side by side on wider screens */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.75rem",
            flexWrap: "wrap",
            justifyContent: "center",
          }}
        >
          {/* Ring */}
          <div style={{ position: "relative", width: 96, height: 96, flexShrink: 0 }}>
            <IndeterminateRing size={96} strokeWidth={6} />
            {/* Status dot in center */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <span
                className={`status-dot${isFailed ? " error" : ""}`}
                style={{ width: 10, height: 10 }}
                aria-hidden="true"
              />
            </div>
          </div>

          {/* Elapsed time */}
          <div style={{ textAlign: "left" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.25rem" }}>
              <span className="elapsed-time">{elapsed.minutes > 0 ? elapsed.minutes : elapsed.seconds}</span>
              <span className="elapsed-unit">{elapsed.minutes > 0 ? `m ${String(elapsed.seconds).padStart(2,"0")}s` : "s"}</span>
            </div>
            <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", marginTop: "0.5rem" }}>
              elapsed
            </p>
          </div>
        </div>

        {/* Status label */}
        <p
          style={{
            fontSize: "0.9375rem",
            color: isFailed ? "var(--color-error)" : "var(--color-muted)",
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            justifyContent: "center",
          }}
        >
          {!isFailed && (
            <span className="status-dot" style={{ width: 7, height: 7 }} aria-hidden="true" />
          )}
          {STATUS_LABELS[status] ?? "Processing…"}
        </p>
      </div>

      {/* ── Pipeline stages (static, honest estimate) ─────── */}
      <PipelineStages status={status} />

      {/* ── Error card (pipeline failure) ─────────────────── */}
      {isFailed && apiError && !dismissed && (
        <ErrorCard
          title="Pipeline failed"
          message={apiError}
          onDismiss={() => setDismissed(true)}
          onReset={onReset}
        />
      )}

      {/* ── Error card (network error) ────────────────────── */}
      {isNetworkError && (
        <ErrorCard
          title="Connection error"
          message={
            error instanceof ApiError
              ? error.detail
              : "Could not reach the server. Check your connection and try again."
          }
          onDismiss={onReset}
          onReset={onReset}
          dismissLabel="Start over"
        />
      )}

      {/* ── Cancel / reset ────────────────────────────────── */}
      {!isFailed && !isNetworkError && (
        <div style={{ textAlign: "center" }}>
          <button
            className="btn-ghost"
            onClick={onReset}
            style={{ fontSize: "0.8125rem" }}
          >
            Cancel &amp; start over
          </button>
        </div>
      )}
    </div>
  );
}

// ── Pipeline stages ───────────────────────────────────────────────────────────

function PipelineStages({ status }: { status: string }) {
  const stages = [
    { key: "queued",     label: "Job queued",              hint: "Waiting for GPU worker" },
    { key: "processing", label: "Tiling & detection",      hint: "DeepForest crown detection" },
    { key: "processing", label: "Crown segmentation",      hint: "SAM2 mask refinement" },
    { key: "done",       label: "Area & confidence",       hint: "Metric area calculation" },
  ];

  const orderMap: Record<string, number> = { queued: 0, processing: 1, done: 3, failed: 1 };
  const current = orderMap[status] ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0" }}>
      {stages.map((stage, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "0.875rem",
              padding: "0.625rem 0",
              borderBottom: i < stages.length - 1 ? "1px solid var(--color-border)" : undefined,
              opacity: done || active ? 1 : 0.35,
              transition: "opacity 400ms",
            }}
          >
            {/* Step indicator */}
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
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              {done ? (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
                  <path d="M2 5.5l2.5 2.5 4.5-4.5" stroke="white" strokeWidth="1.5"
                        strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              ) : (
                <span
                  style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: active ? "var(--color-green)" : "var(--color-faint)",
                  }}
                />
              )}
            </div>
            <div>
              <p style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--color-text)" }}>
                {stage.label}
              </p>
              <p style={{ fontSize: "0.75rem", color: "var(--color-muted)", marginTop: "0.125rem" }}>
                {stage.hint}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── Error card ────────────────────────────────────────────────────────────────

interface ErrorCardProps {
  title: string;
  message: string;
  onDismiss: () => void;
  onReset: () => void;
  dismissLabel?: string;
}

function ErrorCard({ title, message, onDismiss, onReset, dismissLabel = "Dismiss" }: ErrorCardProps) {
  return (
    <div className="error-card fade-in">
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <span aria-hidden="true" style={{ color: "var(--color-error)", fontSize: "1.125rem", lineHeight: 1 }}>⚠</span>
          <p style={{ fontWeight: 600, color: "var(--color-error)", fontSize: "0.9375rem" }}>{title}</p>
        </div>
        <button
          className="btn-ghost"
          onClick={onDismiss}
          style={{ padding: "0.25rem 0.625rem", fontSize: "0.75rem", lineHeight: 1.2 }}
          aria-label="Dismiss error"
        >
          {dismissLabel}
        </button>
      </div>

      {/* Error message from API */}
      <pre
        style={{
          fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
          fontSize: "0.75rem",
          color: "#e07070",
          background: "rgba(0,0,0,0.2)",
          borderRadius: 6,
          padding: "0.75rem 1rem",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          margin: "0 0 1rem 0",
          maxHeight: 160,
          overflowY: "auto",
        }}
      >
        {message}
      </pre>

      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <button className="btn-error" onClick={onReset}>
          ↺ Try again
        </button>
      </div>
    </div>
  );
}
