/**
 * DropZone.tsx — reusable drag-and-drop zone
 */
import type { FC, ReactNode } from "react";
import { useRef, useCallback, useState } from "react";

interface DropZoneProps {
  id: string;
  accept: string[];
  maxSizeBytes?: number;
  hasFile: boolean;
  isDragging?: boolean;
  disabled?: boolean;
  children: ReactNode;
  onFile: (file: File) => void;
  onError?: (msg: string) => void;
  className?: string;
  style?: React.CSSProperties;
  "aria-label"?: string;
}

export const DropZone: FC<DropZoneProps> = ({
  id,
  accept,
  maxSizeBytes = 200 * 1024 * 1024,
  hasFile,
  disabled = false,
  children,
  onFile,
  onError,
  className = "",
  style,
  "aria-label": ariaLabel,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const counter = useRef(0);

  const validate = useCallback(
    (file: File): string | null => {
      const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
      if (!accept.includes(ext))
        return `Unsupported format "${ext}". Accepted: ${accept.join(", ")}`;
      if (file.size > maxSizeBytes) {
        const mb = (file.size / 1024 / 1024).toFixed(1);
        const max = Math.round(maxSizeBytes / 1024 / 1024);
        return `File is ${mb} MB — exceeds the ${max} MB limit`;
      }
      return null;
    },
    [accept, maxSizeBytes],
  );

  const handleFile = useCallback(
    (file: File) => {
      const err = validate(file);
      if (err) { onError?.(err); return; }
      onFile(file);
    },
    [validate, onFile, onError],
  );

  const onDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    if (disabled) return;
    counter.current++;
    setIsDragging(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    counter.current--;
    if (counter.current === 0) setIsDragging(false);
  };
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    counter.current = 0;
    setIsDragging(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const classes = [
    "drop-zone",
    isDragging ? "drag-over" : "",
    hasFile ? "has-file" : "",
    disabled ? "opacity-50 cursor-not-allowed" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={style}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={ariaLabel}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={() => !disabled && inputRef.current?.click()}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          inputRef.current?.click();
        }
      }}
    >
      <input
        ref={inputRef}
        id={id}
        type="file"
        accept={accept.join(",")}
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = "";
        }}
        aria-hidden="true"
        tabIndex={-1}
      />
      {children}
    </div>
  );
};
