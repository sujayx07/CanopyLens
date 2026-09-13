import React from "react";

interface LeafIconProps {
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function LeafIcon({ size = 28, className, style }: LeafIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 28 28"
      fill="none"
      aria-hidden="true"
      className={className}
      style={{ flexShrink: 0, ...style }}
    >
      <path
        d="M14 3C14 3 5 7 5 16c0 4.97 4.03 9 9 9s9-4.03 9-9c0-3-1.2-5.73-3.16-7.73"
        stroke="#10B981"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M14 25V13M14 13c0 0-3-3-6-3"
        stroke="#10B981"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 18c0 0 2.5-2 5-2"
        stroke="#6EE7B7"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default LeafIcon;
