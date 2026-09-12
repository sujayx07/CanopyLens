/**
 * useElapsedTime.ts — live elapsed-time counter
 *
 * Starts counting from `startedAt` (Date | null).
 * Returns { minutes, seconds, formatted } updated every second.
 * Cleans up the interval automatically.
 */
import { useEffect, useState } from "react";

interface Elapsed {
  minutes: number;
  seconds: number;
  /** e.g. "2m 34s" or "45s" */
  formatted: string;
}

function format(totalSeconds: number): Elapsed {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const formatted =
    minutes > 0
      ? `${minutes}m ${String(seconds).padStart(2, "0")}s`
      : `${seconds}s`;
  return { minutes, seconds, formatted };
}

export function useElapsedTime(startedAt: Date | null): Elapsed {
  const [elapsed, setElapsed] = useState<Elapsed>(format(0));

  useEffect(() => {
    if (!startedAt) { setElapsed(format(0)); return; }

    const tick = () => {
      const secs = Math.floor((Date.now() - startedAt.getTime()) / 1000);
      setElapsed(format(secs));
    };

    tick(); // immediate first tick
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  return elapsed;
}
