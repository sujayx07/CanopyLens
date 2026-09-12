/**
 * api.ts — CanopyLens typed API client
 *
 * All functions match the backend contract exactly (see backend/app/routers/analysis.py).
 * Multipart uploads use FormData directly; JSON polling uses apiFetch.
 */

export const API_URL: string =
  (import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000";

// ── Error type ────────────────────────────────────────────────────────────────

/** Thrown when any API response is non-2xx. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail: string;

  constructor(status: number, detail: string) {
    super(`API ${status}: ${detail}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

// ── Core fetch helper ─────────────────────────────────────────────────────────

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);

  if (!res.ok) {
    // Backend returns {"detail": "..."} for 4xx errors
    let detail = res.statusText;
    try {
      const body = (await res.json()) as { detail?: string };
      if (body.detail) detail = body.detail;
    } catch {
      try { detail = await res.text(); } catch { /* ignore */ }
    }
    throw new ApiError(res.status, detail);
  }

  return (await res.json()) as T;
}

// ── Response types ────────────────────────────────────────────────────────────

/** POST /analyze → HTTP 202 */
export interface AnalyzeResponse {
  job_id: string;
  /** Always "queued" at creation time. */
  status: "queued";
  /** ISO-8601 UTC timestamp. */
  created_at: string;
}

/** GET /jobs/{job_id} */
export interface JobStatus {
  status: "queued" | "processing" | "done" | "failed";
  /** Populated only when status is "failed". */
  error: string | null;
}

import type {
  Point, LineString, Polygon, MultiPoint, MultiLineString,
  MultiPolygon, GeometryCollection,
} from "geojson";

type GeoJsonGeometry =
  | Point | LineString | Polygon
  | MultiPoint | MultiLineString | MultiPolygon
  | GeometryCollection;

/** Single detected tree crown Feature (inside GeoJSON FeatureCollection). */
export interface TreeFeature {
  type: "Feature";
  geometry: GeoJsonGeometry;

  properties: {
    tree_id: number;
    area_m2: number | null;
    area_px: number;
    confidence: number;
    confidence_bucket: "high" | "medium" | "low";
    on_tile_edge: boolean;
    mask_quality: number;
  };
}

/** Top-level summary returned alongside the FeatureCollection. */
export interface ResultSummary {
  tree_count: number;
  sum_area_m2: number | null;
  union_area_m2: number | null;
  canopy_cover_percent: number | null;
  confidence_breakdown: { high: number; medium: number; low: number };
  georeferenced: boolean;
  warnings: string[];
  image_width?: number;
  image_height?: number;
  image_bounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
    coordinates: [[number, number], [number, number], [number, number], [number, number]];
  } | null;
  /** Present only when not georeferenced. */
  sum_area_px?: number;
  union_area_px?: number;
}

/** GET /jobs/{job_id}/result */
export interface JobResult {
  type: "FeatureCollection";
  features: TreeFeature[];
  summary: ResultSummary;
}

// ── API functions ─────────────────────────────────────────────────────────────

/**
 * POST /analyze
 *
 * Submits the image (and optional KML boundary) as multipart/form-data.
 * Returns a job ID immediately — the pipeline runs in the background.
 */
export async function uploadAndAnalyze(
  image: File,
  kml?: File,
): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("image", image, image.name);
  if (kml) form.append("kml", kml, kml.name);

  // Do NOT set Content-Type — browser sets it automatically with correct boundary.
  return apiFetch<AnalyzeResponse>("/analyze", {
    method: "POST",
    body: form,
  });
}

/**
 * GET /jobs/{jobId}
 *
 * Poll this endpoint every 2 s until status is "done" or "failed".
 * When status is "failed", the actual pipeline exception message is in `error`.
 */
export async function getJobStatus(jobId: string): Promise<JobStatus> {
  return apiFetch<JobStatus>(`/jobs/${jobId}`);
}

/**
 * GET /jobs/{jobId}/result
 *
 * Returns GeoJSON FeatureCollection + summary.
 * Throws HTTP 409 if the job is not yet "done".
 */
export async function getJobResult(jobId: string): Promise<JobResult> {
  return apiFetch<JobResult>(`/jobs/${jobId}/result`);
}

/**
 * GET /health
 *
 * Used for connection validation; not part of the core analysis flow.
 */
export async function getHealth(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>("/health");
}

/** Export URL helpers for download and image buttons. */
export const getGeoJsonExportUrl = (jobId: string): string =>
  `${API_URL}/jobs/${jobId}/export/geojson`;

export const getCsvExportUrl = (jobId: string): string =>
  `${API_URL}/jobs/${jobId}/export/csv`;

export const getJobImageUrl = (jobId: string): string =>
  `${API_URL}/jobs/${jobId}/image`;