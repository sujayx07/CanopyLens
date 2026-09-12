/**
 * UploadPanel.tsx — drag-and-drop upload state (Screen 1)
 *
 * Responsibilities:
 *   - Image drop zone (required) + KML drop zone (optional)
 *   - File info display: name, size, detected format label
 *   - "Analyze" button (disabled until image selected)
 *   - Inline drop zone validation error messages
 *   - Honest one-paragraph about text
 */
import { useState, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { DropZone } from "./DropZone";
import { FileBadge, detectFormat } from "./FileBadge";
import { ApiError, uploadAndAnalyze, type AnalyzeResponse } from "../lib/api";

const IMAGE_ACCEPT = [".tif", ".tiff", ".png", ".jpg", ".jpeg"];
const KML_ACCEPT = [".kml"];
const MAX_IMAGE_BYTES = 200 * 1024 * 1024;

// ── SVG icons ────────────────────────────────────────────────────────────────

function ImageIcon() {
  return (
    <svg
      width="48" height="48" viewBox="0 0 48 48" fill="none"
      aria-hidden="true" style={{ opacity: 0.35 }}
    >
      <rect x="6" y="8" width="36" height="28" rx="3" stroke="var(--color-muted)" strokeWidth="2"/>
      <circle cx="16" cy="18" r="3.5" stroke="var(--color-muted)" strokeWidth="2"/>
      <path d="M6 30l10-9 8 8 6-5 12 11" stroke="var(--color-muted)" strokeWidth="2"
            strokeLinejoin="round" strokeLinecap="round"/>
      <path d="M18 40h12" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round"/>
      <path d="M24 36v4" stroke="var(--color-gold)" strokeWidth="2" strokeLinecap="round"/>
    </svg>
  );
}

function BoundaryIcon() {
  return (
    <svg
      width="24" height="24" viewBox="0 0 24 24" fill="none"
      aria-hidden="true" style={{ flexShrink: 0 }}
    >
      <polygon
        points="12,3 21,8 21,16 12,21 3,16 3,8"
        stroke="var(--color-faint)" strokeWidth="1.5" fill="none"
        strokeDasharray="3 2"
      />
      <circle cx="12" cy="12" r="2" fill="var(--color-faint)"/>
    </svg>
  );
}

function UploadArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M8 11V3M4 6l4-4 4 4" stroke="currentColor" strokeWidth="1.75"
            strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 13h12" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"/>
    </svg>
  );
}

// ── Component ─────────────────────────────────────────────────────────────────

interface UploadPanelProps {
  onJobCreated: (jobId: string, startedAt: Date) => void;
}

export function UploadPanel({ onJobCreated }: UploadPanelProps) {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [kmlFile, setKmlFile] = useState<File | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [kmlError, setKmlError] = useState<string | null>(null);

  const mutation = useMutation<AnalyzeResponse, ApiError, { image: File; kml?: File }>({
    mutationFn: ({ image, kml }) => uploadAndAnalyze(image, kml),
    onSuccess: (data) => {
      onJobCreated(data.job_id, new Date());
    },
  });

  const handleAnalyze = useCallback(() => {
    if (!imageFile) return;
    setImageError(null);
    mutation.mutate({ image: imageFile, kml: kmlFile ?? undefined });
  }, [imageFile, kmlFile, mutation]);

  const isLoading = mutation.isPending;
  const submitError = mutation.error;

  return (
    <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>

      {/* ── Image drop zone ─────────────────────────────────── */}
      <div>
        <label
          style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500,
                   color: "var(--color-muted)", marginBottom: "0.5rem", letterSpacing: "0.03em" }}
        >
          AERIAL IMAGE <span style={{ color: "var(--color-error)", marginLeft: 2 }}>*</span>
        </label>

        <DropZone
          id="image-upload"
          accept={IMAGE_ACCEPT}
          maxSizeBytes={MAX_IMAGE_BYTES}
          hasFile={imageFile !== null}
          disabled={isLoading}
          onFile={(f) => { setImageFile(f); setImageError(null); }}
          onError={(msg) => setImageError(msg)}
          aria-label="Drop your aerial image here or click to select"
          style={{ padding: imageFile ? "1.25rem 1.5rem" : "3rem 1.5rem",
                   textAlign: "center", transition: "padding 250ms ease" }}
        >
          {imageFile ? (
            /* ── has file ── */
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
                <circle cx="10" cy="10" r="9" stroke="var(--color-green)" strokeWidth="1.5"/>
                <path d="M6 10.5l3 3 5-5" stroke="var(--color-green)" strokeWidth="1.75"
                      strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <FileBadge
                file={imageFile}
                formatLabel={detectFormat(imageFile)}
                onRemove={() => { setImageFile(null); setImageError(null); }}
              />
            </div>
          ) : (
            /* ── empty ── */
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.875rem" }}>
              <ImageIcon />
              <div>
                <p style={{ fontWeight: 500, color: "var(--color-text)", marginBottom: "0.25rem" }}>
                  Drop your aerial image here
                </p>
                <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)" }}>
                  GeoTIFF, PNG, or JPEG &mdash; up to 200 MB
                </p>
              </div>
              <span
                style={{ display: "inline-flex", alignItems: "center", gap: "0.375rem",
                         fontSize: "0.8125rem", color: "var(--color-green)",
                         padding: "0.375rem 0.875rem", border: "1px solid var(--color-green)",
                         borderRadius: 6, marginTop: "0.25rem" }}
              >
                <UploadArrowIcon /> Browse files
              </span>
            </div>
          )}
        </DropZone>

        {imageError && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-error)", marginTop: "0.5rem",
                      display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span aria-hidden="true">⚠</span> {imageError}
          </p>
        )}
      </div>

      {/* ── KML boundary drop zone ──────────────────────────── */}
      <div>
        <label
          style={{ display: "block", fontSize: "0.8125rem", fontWeight: 500,
                   color: "var(--color-muted)", marginBottom: "0.5rem", letterSpacing: "0.03em" }}
        >
          KML BOUNDARY <span style={{ color: "var(--color-faint)", fontWeight: 400, marginLeft: 4 }}>optional</span>
        </label>

        <DropZone
          id="kml-upload"
          accept={KML_ACCEPT}
          hasFile={kmlFile !== null}
          disabled={isLoading}
          onFile={(f) => { setKmlFile(f); setKmlError(null); }}
          onError={(msg) => setKmlError(msg)}
          aria-label="Drop a KML boundary file here or click to select"
          style={{ padding: kmlFile ? "1rem 1.5rem" : "1.125rem 1.5rem",
                   display: "flex", alignItems: "center", gap: "0.875rem",
                   transition: "padding 250ms ease" }}
        >
          <BoundaryIcon />
          {kmlFile ? (
            <FileBadge
              file={kmlFile}
              formatLabel="KML"
              onRemove={() => { setKmlFile(null); setKmlError(null); }}
            />
          ) : (
            <span style={{ fontSize: "0.875rem", color: "var(--color-muted)" }}>
              Drop a KML boundary to restrict analysis to a specific area
            </span>
          )}
        </DropZone>

        {kmlError && (
          <p style={{ fontSize: "0.8125rem", color: "var(--color-error)", marginTop: "0.5rem",
                      display: "flex", alignItems: "center", gap: "0.375rem" }}>
            <span aria-hidden="true">⚠</span> {kmlError}
          </p>
        )}
      </div>

      {/* ── API submit error ────────────────────────────────── */}
      {submitError && (
        <div
          className="error-card"
          style={{ display: "flex", alignItems: "flex-start", gap: "0.75rem" }}
        >
          <span style={{ color: "var(--color-error)", fontSize: "1.125rem", lineHeight: 1 }}>⚠</span>
          <div>
            <p style={{ fontWeight: 600, color: "var(--color-error)", fontSize: "0.875rem" }}>
              Upload failed
            </p>
            <p style={{ fontSize: "0.8125rem", color: "#e07070", marginTop: "0.25rem" }}>
              {submitError.detail}
            </p>
          </div>
        </div>
      )}

      {/* ── Analyze button ──────────────────────────────────── */}
      <button
        id="analyze-btn"
        className="btn-primary"
        disabled={!imageFile || isLoading}
        onClick={handleAnalyze}
        aria-busy={isLoading}
      >
        {isLoading ? (
          <>
            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"
                 style={{ animation: "spin 1s linear infinite", flexShrink: 0 }}>
              <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2"
                      strokeDasharray="22 16" strokeLinecap="round" fill="none"/>
            </svg>
            Uploading&hellip;
          </>
        ) : (
          <>Analyze Image</>
        )}
      </button>

      {/* ── About / disclaimer ──────────────────────────────── */}
      <div className="about-section">
        <p style={{ fontSize: "0.8125rem", color: "var(--color-muted)", lineHeight: 1.75 }}>
          <strong style={{ color: "var(--color-text)", fontWeight: 600 }}>What this tool does &mdash; and doesn&rsquo;t.</strong>{" "}
          CanopyLens runs a deep-learning pipeline (DeepForest for bounding-box detection,
          SAM2 for crown segmentation) on your aerial or satellite image to estimate tree
          count and canopy cover. Results are useful for rapid ecological reconnaissance
          but should{" "}
          <strong style={{ color: "var(--color-gold)" }}>not be used as ground-truth</strong>{" "}
          for legal, regulatory, or carbon-credit purposes. Accuracy degrades on images
          taken below ~10 cm GSD, in dense shadows, or when trees overlap heavily. Crowns
          flagged as &ldquo;low-confidence&rdquo; or &ldquo;on tile edge&rdquo; are especially uncertain.
          No data leaves this browser except to the processing server &mdash; uploads are
          discarded after the session.
        </p>
      </div>
    </div>
  );
}
