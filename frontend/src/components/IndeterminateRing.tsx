/**
 * IndeterminateRing.tsx — SVG-based indeterminate progress circle
 *
 * Renders a spinning arc indicating "work in progress" without a percentage.
 * The animation is defined in index.css (.progress-circle-spin).
 */
import type { FC } from "react";

interface IndeterminateRingProps {
  size?: number;
  strokeWidth?: number;
}

export const IndeterminateRing: FC<IndeterminateRingProps> = ({
  size = 80,
  strokeWidth = 5,
}) => {
  const r = (size - strokeWidth) / 2;
  const cx = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Track */}
      <circle
        className="progress-circle-track"
        cx={cx}
        cy={cx}
        r={r}
        strokeWidth={strokeWidth}
      />
      {/* Animated arc */}
      <circle
        className="progress-circle-spin"
        cx={cx}
        cy={cx}
        r={r}
        strokeWidth={strokeWidth}
        strokeDasharray={`${2 * Math.PI * r}`}
        transform={`rotate(-90 ${cx} ${cx})`}
      />
    </svg>
  );
};
