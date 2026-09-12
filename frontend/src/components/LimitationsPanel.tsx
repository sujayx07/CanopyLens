/**
 * LimitationsPanel.tsx — Permanent, collapsible limitations and scientific transparency panel
 *
 * Requirements:
 * 1. Collapsible but visible by default (not hidden in a menu)
 * 2. Exact content:
 *    - "This tool may undercount trees in dense or overlapping canopy."
 *    - "Detection quality depends on image resolution — very small or blurry crowns may be missed."
 *    - "This is not a certified carbon or biomass estimate."
 *    - "Low-confidence detections should be manually reviewed before use in reporting."
 */

import { useState } from "react";

export function LimitationsPanel() {
  const [isOpen, setIsOpen] = useState(true);

  const points = [
    "This tool may undercount trees in dense or overlapping canopy.",
    "Detection quality depends on image resolution — very small or blurry crowns may be missed.",
    "This is not a certified carbon or biomass estimate.",
    "Low-confidence detections should be manually reviewed before use in reporting.",
  ];

  return (
    <div
      style={{
        background: "var(--color-surface-2)",
        border: "1px solid var(--color-border)",
        borderRadius: 10,
        overflow: "hidden",
        transition: "border-color 200ms ease",
      }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: "1rem 1.25rem",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={isOpen}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.625rem" }}>
          <span style={{ color: "var(--color-gold)", fontSize: "1rem" }}>⚠</span>
          <span style={{ fontSize: "0.875rem", fontWeight: 600, color: "var(--color-text)" }}>
            Methodological Limitations &amp; Best Practices
          </span>
        </div>
        <span
          style={{
            color: "var(--color-muted)",
            fontSize: "0.75rem",
            display: "flex",
            alignItems: "center",
            gap: "0.375rem",
          }}
        >
          {isOpen ? "Collapse" : "Expand"}
          <span
            style={{
              display: "inline-block",
              transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
              transition: "transform 200ms ease",
            }}
          >
            ▼
          </span>
        </span>
      </button>

      {isOpen && (
        <div
          style={{
            padding: "0 1.25rem 1.25rem 1.25rem",
            borderTop: "1px solid rgba(45, 90, 48, 0.4)",
          }}
        >
          <ul
            style={{
              margin: "1rem 0 0 0",
              paddingLeft: "1.25rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.625rem",
              fontSize: "0.8125rem",
              color: "var(--color-muted)",
              lineHeight: 1.6,
            }}
          >
            {points.map((pt, i) => (
              <li key={i}>
                <span style={{ color: "var(--color-text)" }}>{pt}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
