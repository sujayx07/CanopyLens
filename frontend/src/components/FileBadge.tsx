/**
 * FileBadge.tsx — displays a file name + size chip with remove button
 */
import type { FC } from "react";

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024)
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  if (bytes >= 1024)
    return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
}

interface FileBadgeProps {
  file: File;
  formatLabel?: string; // e.g. "GeoTIFF", "KML"
  onRemove: () => void;
}

export const FileBadge: FC<FileBadgeProps> = ({ file, formatLabel, onRemove }) => {
  const name =
    file.name.length > 28 ? file.name.slice(0, 25) + "…" : file.name;

  return (
    <span className="file-badge" title={file.name}>
      {/* format icon */}
      {formatLabel && (
        <span
          style={{
            fontSize: "0.6875rem",
            fontWeight: 600,
            color: "var(--color-green)",
            background: "rgba(58,155,64,0.12)",
            padding: "1px 5px",
            borderRadius: 4,
            letterSpacing: "0.04em",
          }}
        >
          {formatLabel}
        </span>
      )}
      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{name}</span>
      <span className="badge-size">{formatBytes(file.size)}</span>
      <button
        className="badge-remove"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        aria-label={`Remove ${file.name}`}
        title="Remove file"
      >
        ×
      </button>
    </span>
  );
};

/** Detect a user-friendly format label from the file extension. */
export function detectFormat(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    tif: "GeoTIFF",
    tiff: "GeoTIFF",
    png: "PNG",
    jpg: "JPEG",
    jpeg: "JPEG",
    kml: "KML",
  };
  return map[ext] ?? ext.toUpperCase();
}
