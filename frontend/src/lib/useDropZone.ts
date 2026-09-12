/**
 * useDropZone.ts — drag-and-drop hook with validation
 */
import { useCallback, useRef, useState } from "react";

export interface UseDropZoneOptions {
  accept?: string[];        // e.g. [".tif", ".tiff", ".png", ".jpg", ".jpeg"]
  maxSizeBytes?: number;    // default 200 MB
  onFile: (file: File) => void;
  onError?: (message: string) => void;
}

export interface UseDropZoneReturn {
  isDragging: boolean;
  rootProps: React.HTMLAttributes<HTMLElement>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  openFileDialog: () => void;
}

export function useDropZone({
  accept,
  maxSizeBytes = 200 * 1024 * 1024,
  onFile,
  onError,
}: UseDropZoneOptions): UseDropZoneReturn {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragCounter = useRef(0);

  const validate = useCallback(
    (file: File): string | null => {
      if (accept) {
        const ext = "." + (file.name.split(".").pop() ?? "").toLowerCase();
        if (!accept.includes(ext)) {
          return `Unsupported format (${ext}). Accepted: ${accept.join(", ")}`;
        }
      }
      if (file.size > maxSizeBytes) {
        const mb = Math.round(file.size / 1024 / 1024);
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

  const onDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    setIsDragging(true);
  }, []);

  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current === 0) setIsDragging(false);
  }, []);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      dragCounter.current = 0;
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const onChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      // Reset so the same file can be re-selected
      e.target.value = "";
    },
    [handleFile],
  );

  const openFileDialog = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const rootProps: React.HTMLAttributes<HTMLElement> = {
    onDragEnter,
    onDragLeave,
    onDragOver,
    onDrop,
  };

  // Attach onChange to input via ref (caller renders the input)
  if (inputRef.current) {
    inputRef.current.onchange = onChange as unknown as ((e: Event) => void);
  }

  return { isDragging, rootProps, inputRef, openFileDialog };
}
