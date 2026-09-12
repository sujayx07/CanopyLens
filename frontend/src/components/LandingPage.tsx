import { useState, useEffect } from "react";
import { getHealth } from "../lib/api";
import { UploadPanel } from "./UploadPanel";

interface LandingPageProps {
  onLaunchWorkspace: () => void;
  onExploreDemo: () => void;
  onLoadSample: () => void;
  onJobCreated: (jobId: string, startedAt: Date) => void;
}

interface TreeDetail {
  id: number;
  species: string;
  speciesCommon: string;
  area: number;
  diameter: number;
  confidence: number;
  height: number;
  ndvi: number;
  status: string;
  cx: number;
  cy: number;
}

const SAMPLE_TREES: Record<number, TreeDetail> = {
  402: {
    id: 402,
    species: "Pseudotsuga menziesii",
    speciesCommon: "Douglas Fir",
    area: 34.2,
    diameter: 6.6,
    confidence: 96.4,
    height: 28.4,
    ndvi: 0.82,
    status: "Optimal",
    cx: 535,
    cy: 355,
  },
  101: {
    id: 101,
    species: "Tsuga heterophylla",
    speciesCommon: "Western Hemlock",
    area: 42.1,
    diameter: 7.3,
    confidence: 94.0,
    height: 31.2,
    ndvi: 0.79,
    status: "Healthy",
    cx: 175,
    cy: 140,
  },
  102: {
    id: 102,
    species: "Pinus ponderosa",
    speciesCommon: "Ponderosa Pine",
    area: 48.6,
    diameter: 7.8,
    confidence: 92.5,
    height: 33.6,
    ndvi: 0.81,
    status: "Optimal",
    cx: 370,
    cy: 200,
  },
  103: {
    id: 103,
    species: "Picea sitchensis",
    speciesCommon: "Sitka Spruce",
    area: 55.4,
    diameter: 8.4,
    confidence: 95.2,
    height: 35.8,
    ndvi: 0.85,
    status: "Vigorous",
    cx: 760,
    cy: 170,
  },
  104: {
    id: 104,
    species: "Thuja plicata",
    speciesCommon: "Western Red Cedar",
    area: 58.2,
    diameter: 8.6,
    confidence: 97.0,
    height: 34.0,
    ndvi: 0.88,
    status: "Vigorous",
    cx: 680,
    cy: 450,
  },
};

export function LandingPage({
  onLaunchWorkspace,
  onExploreDemo,
  onLoadSample,
  onJobCreated,
}: LandingPageProps) {
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [selectedTreeId, setSelectedTreeId] = useState<number>(402);
  const [showPolygons, setShowPolygons] = useState(true);
  const [showCentroids, setShowCentroids] = useState(true);
  const [showOverlap, setShowOverlap] = useState(true);
  const [showNdvi, setShowNdvi] = useState(false);
  const [activeWorkflowStage, setActiveWorkflowStage] = useState<number>(0);
  const [zoomLevel, setZoomLevel] = useState(100);

  // Check health on mount
  useEffect(() => {
    let mounted = true;
    getHealth()
      .then(() => {
        if (mounted) setBackendOnline(true);
      })
      .catch(() => {
        if (mounted) setBackendOnline(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const selectedTree = SAMPLE_TREES[selectedTreeId] ?? SAMPLE_TREES[402];

  return (
    <div className="bg-[#0A0F0D] text-[#DFE4E0] font-body-ui min-h-screen telemetry-grid selection:bg-[#10B981] selection:text-[#050807] overflow-x-hidden">
      {/* ── STICKY GLASS NAVBAR ────────────────────────────────────────── */}
      <header className="fixed top-0 left-0 right-0 w-full z-50 bg-[#0A0F0D]/85 backdrop-blur-md border-b border-[#3C4A42]/50 shadow-lg">
        <div className="flex justify-between items-center w-full px-6 md:px-12 max-w-7xl mx-auto h-16">
          {/* Logo */}
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            <div className="w-9 h-9 rounded-lg bg-[#182B1B] border border-[#2D5A30] flex items-center justify-center text-[#10B981] shadow-inner">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="font-space text-lg font-bold tracking-tight text-[#F8FAFC] flex items-center gap-1.5">
                CanopyLens
                <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] inline-block"></span>
              </span>
              <span className="font-mono-telemetry text-[9px] text-[#7AAA80] tracking-widest uppercase -mt-0.5">
                ECOLOGICAL CROWN AI
              </span>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="hidden md:flex items-center gap-8">
            <a href="#platform" className="font-mono-telemetry text-xs tracking-wider uppercase text-[#10B981] border-b border-[#10B981] pb-1">
              Platform
            </a>
            <a href="#workflow" className="font-mono-telemetry text-xs tracking-wider uppercase text-[#94A3B8] hover:text-[#10B981] transition-colors">
              Workflow
            </a>
            <a href="#studio-preview" className="font-mono-telemetry text-xs tracking-wider uppercase text-[#94A3B8] hover:text-[#10B981] transition-colors">
              Studio Demo
            </a>
            <a href="#transparency" className="font-mono-telemetry text-xs tracking-wider uppercase text-[#94A3B8] hover:text-[#10B981] transition-colors">
              Rigor & Trust
            </a>
            <a href="#workspace" className="font-mono-telemetry text-xs tracking-wider uppercase text-[#94A3B8] hover:text-[#10B981] transition-colors">
              Workspace
            </a>
          </nav>

          {/* Trailing Actions */}
          <div className="flex items-center gap-4">
            {/* Live Backend Status */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded bg-[#181D1A] border border-[#3C4A42] font-mono-telemetry text-xs">
              <span className={`w-2 h-2 rounded-full ${backendOnline ? "bg-[#10B981] status-pulse" : "bg-[#C8A84B]"}`}></span>
              <span className="text-[#6EE7B7]">
                {backendOnline === null ? "Connecting..." : backendOnline ? "Modal T4 GPU: Online" : "Backend Standby"}
              </span>
            </div>

            {/* Launch Workspace CTA */}
            <button
              onClick={onLaunchWorkspace}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#10B981] text-[#050807] font-space font-semibold text-xs tracking-wider uppercase hover:bg-[#6EE7B7] transition-all shadow-[0_0_16px_rgba(16,185,129,0.3)] active:scale-95 cursor-pointer"
            >
              <span>Launch Studio</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── HERO SECTION ───────────────────────────────────────────────── */}
      <section id="platform" className="pt-32 pb-20 md:pt-40 md:pb-28 relative overflow-hidden border-b border-[#3C4A42]/30">
        {/* Glow blooms */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[850px] h-[380px] bg-[#10B981]/10 rounded-full blur-[140px] pointer-events-none -z-10"></div>
        <div className="absolute top-48 right-10 w-[350px] h-[250px] bg-[#059669]/10 rounded-full blur-[110px] pointer-events-none -z-10"></div>

        <div className="max-w-7xl mx-auto px-6 md:px-12">
          {/* Super-title badge */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#181D1A]/90 border border-[#3C4A42] text-[#10B981] font-mono-telemetry text-xs uppercase tracking-widest backdrop-blur-md">
              <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] status-pulse"></span>
              <span>ORBITAL & DRONE DEEPFOREST + SAM2 PIPELINE v3.4</span>
            </div>
            <div className="hidden sm:inline-flex items-center gap-2 px-3 py-1 rounded bg-[#0A0F0D] border border-[#3C4A42]/40 text-[#86948A] font-mono-telemetry text-xs">
              <span>EPSG:4326</span>
              <span className="text-[#3C4A42]">|</span>
              <span>Lat 45.312° N, Long 122.189° W</span>
            </div>
          </div>

          {/* Monumental Display Headline */}
          <div className="max-w-5xl mb-8">
            <h1 className="font-display-hero text-4xl sm:text-6xl md:text-7xl lg:text-[76px] font-normal text-[#F8FAFC] leading-[1.06] tracking-tight">
              Earth’s Canopy, <br />
              <span className="italic font-normal bg-clip-text text-transparent bg-gradient-to-r from-[#10B981] via-[#6EE7B7] to-[#80F9C8]">
                Decoded Tree by Tree.
              </span>
            </h1>
          </div>

          {/* Editorial Subtitle & Contextual CTAs */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end">
            <div className="lg:col-span-8">
              <p className="font-body-ui text-lg md:text-xl text-[#94A3B8] max-w-2xl leading-relaxed">
                High-precision instance segmentation translating multi-spectral GeoTIFF orthomosaics into vectorized tree crown polygons, automated non-overlapping canopy cover percentages, and ecological telemetry.
              </p>

              {/* Action Buttons */}
              <div className="mt-8 flex flex-wrap items-center gap-4">
                <button
                  onClick={onLaunchWorkspace}
                  className="px-6 py-3.5 rounded-lg bg-[#10B981] text-[#050807] font-space font-semibold text-sm uppercase tracking-wider hover:bg-[#6EE7B7] transition-all duration-150 flex items-center gap-2.5 shadow-[0_0_24px_rgba(16,185,129,0.35)] cursor-pointer active:scale-95"
                >
                  <span>Start Free Analysis</span>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="16"/>
                    <line x1="8" y1="12" x2="16" y2="12"/>
                  </svg>
                </button>

                <button
                  onClick={onExploreDemo}
                  className="px-6 py-3.5 rounded-lg bg-[#182B1B]/80 backdrop-blur-md text-[#F8FAFC] font-space font-medium text-sm border border-[#2D5A30] hover:border-[#10B981]/60 hover:text-[#10B981] transition-all duration-150 flex items-center gap-2 cursor-pointer"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="5 3 19 12 5 21 5 3"/>
                  </svg>
                  <span>Explore Interactive Results</span>
                </button>

                <button
                  onClick={onLoadSample}
                  className="px-4 py-3.5 rounded-lg bg-[#181D1A] text-[#7AAA80] hover:text-[#6EE7B7] hover:border-[#3C4A42] border border-[#262B29] font-mono-telemetry text-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                  title="Load pre-calibrated OSBS crop GeoTIFF"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>
                  </svg>
                  <span>Load Sample GeoTIFF</span>
                </button>
              </div>
            </div>

            {/* Telemetry HUD Card */}
            <div className="lg:col-span-4">
              <div className="p-4 rounded-xl bg-[#0A0F0D]/90 border border-[#3C4A42]/60 backdrop-blur-md font-mono-telemetry text-xs text-[#94A3B8] space-y-2.5 shadow-2xl">
                <div className="flex justify-between items-center pb-2 border-b border-[#3C4A42]/40">
                  <span className="text-[#86948A] uppercase tracking-wider text-[10px]">Inference Cluster</span>
                  <span className="text-[#10B981] flex items-center gap-1.5 font-medium">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] status-pulse"></span>
                    DeepForest + SAM2
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#86948A]">Tile Overlap Stride:</span>
                  <span className="text-[#F8FAFC]">15% Spatial IoU</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-[#86948A]">Vector Mask Output:</span>
                  <span className="text-[#6EE7B7]">GeoJSON / Shapefile / COG</span>
                </div>
                <div className="flex justify-between items-center pt-1 text-[10px] text-[#86948A] border-t border-[#3C4A42]/30">
                  <span>PROJECTION: WGS 84 / UTM 10N</span>
                  <span className="text-[#10B981] font-bold">GSD: 0.04m/px</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── LIVE METRIC TICKER RIBBON ───────────────────────────────────── */}
      <section className="py-8 bg-[#070B09] border-b border-[#3C4A42]/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6 lg:gap-12">
            <div className="flex flex-col border-l-2 border-[#10B981]/50 pl-4 py-1">
              <span className="font-display-hero text-2xl md:text-3xl font-normal text-[#F8FAFC]">50,000+ Ha</span>
              <span className="font-mono-telemetry text-xs text-[#10B981] mt-1 font-semibold uppercase">Analyzed Coverage</span>
              <span className="font-body-ui text-xs text-[#86948A] mt-0.5">Across boreal & temperate zones</span>
            </div>
            <div className="flex flex-col border-l-2 border-[#10B981]/50 pl-4 py-1">
              <span className="font-display-hero text-2xl md:text-3xl font-normal text-[#F8FAFC]">Sub-meter</span>
              <span className="font-mono-telemetry text-xs text-[#10B981] mt-1 font-semibold uppercase">Crown Precision</span>
              <span className="font-body-ui text-xs text-[#86948A] mt-0.5">Down to 0.05m GSD resolution</span>
            </div>
            <div className="flex flex-col border-l-2 border-[#10B981]/50 pl-4 py-1">
              <span className="font-display-hero text-2xl md:text-3xl font-normal text-[#F8FAFC]">SAM2 Masks</span>
              <span className="font-mono-telemetry text-xs text-[#10B981] mt-1 font-semibold uppercase">Hierarchical Topology</span>
              <span className="font-body-ui text-xs text-[#86948A] mt-0.5">Edge-refined discrete polygons</span>
            </div>
            <div className="flex flex-col border-l-2 border-[#10B981]/50 pl-4 py-1">
              <span className="font-display-hero text-2xl md:text-3xl font-normal text-[#F8FAFC]">Zero Overlap</span>
              <span className="font-mono-telemetry text-xs text-[#10B981] mt-1 font-semibold uppercase">Inflation Filter</span>
              <span className="font-body-ui text-xs text-[#86948A] mt-0.5">Exact planar union vs sum accounting</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE WORKSPACE STUDIO PREVIEW (THE HERO DEMO) ────────── */}
      <section id="studio-preview" className="py-20 md:py-28 relative">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          {/* Section Header */}
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#181D1A] border border-[#3C4A42] text-[#10B981] font-mono-telemetry text-xs uppercase mb-3">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="12 2 2 7 12 12 22 7 12 2"></polygon>
                  <polyline points="2 17 12 22 22 17"></polyline>
                  <polyline points="2 12 12 17 22 12"></polyline>
                </svg>
                <span>Live Vector Crown Telemetry</span>
              </div>
              <h2 className="font-headline-lg text-3xl md:text-4xl text-[#F8FAFC]">
                CanopyLens Studio Inspector
              </h2>
            </div>
            <div className="flex items-center gap-3 font-mono-telemetry text-xs text-[#86948A]">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#10B981] status-pulse"></span>
                EPSG:32610 (UTM 10N)
              </span>
              <span>•</span>
              <span>Resolution: 3.8 cm/px GSD</span>
            </div>
          </div>

          {/* Studio Workstation Window */}
          <div className="rounded-2xl border border-[#3C4A42]/60 bg-[#0A0F0D] overflow-hidden shadow-[0_24px_64px_rgba(0,0,0,0.9)] relative">
            {/* Top Bar HUD */}
            <div className="h-12 bg-[#181D1A]/95 backdrop-blur-md border-b border-[#3C4A42]/40 px-4 md:px-6 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[#313633]"></span>
                  <span className="w-3 h-3 rounded-full bg-[#313633]"></span>
                  <span className="w-3 h-3 rounded-full bg-[#313633]"></span>
                </div>
                <span className="text-[#3C4A42]">|</span>
                <div className="flex items-center gap-2 font-mono-telemetry text-xs text-[#F8FAFC]">
                  <span className="text-[#10B981]">◉</span>
                  <span>CanopyLens Studio — Orthomosaic Layer 4K [Ortho_PacificNW_2024.tif]</span>
                </div>
              </div>
              <div className="hidden md:flex items-center gap-4 font-mono-telemetry text-xs">
                <div className="flex items-center gap-1.5 text-[#10B981]">
                  <span>1,248 CROWNS DETECTED</span>
                </div>
                <div className="px-2 py-0.5 rounded bg-[#1C211E] border border-[#3C4A42] text-[#86948A]">
                  ZOOM: {zoomLevel}%
                </div>
              </div>
            </div>

            {/* Main Canvas & Inspector Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 relative min-h-[580px] reticle-cursor">
              {/* Aerial Orthomosaic Viewport with Interactive Vector HUD */}
              <div className="lg:col-span-9 relative overflow-hidden bg-[#0A0F0D] min-h-[480px]">
                {/* Aerial Orthomosaic Base Map Image */}
                <img
                  src="/orthomosaic_pacific_nw.jpg"
                  alt="Aerial top-down drone orthomosaic photo of Pacific Northwest evergreen forest canopy"
                  className={`absolute inset-0 w-full h-full object-cover select-none transition-transform duration-300 ${showNdvi ? "hue-rotate-90 saturate-150" : ""}`}
                  style={{ transform: `scale(${zoomLevel / 100})` }}
                />

                {/* Grid line overlay */}
                <div className="absolute inset-0 bg-[#0A0F0D]/20 telemetry-grid pointer-events-none"></div>

                {/* SVG Vector Segmentation Overlay */}
                <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 1000 650">
                  <defs>
                    <filter id="emerald-glow" x="-20%" y="-20%" width="140%" height="140%">
                      <feGaussianBlur stdDeviation="3" result="blur" />
                      <feComposite in="SourceGraphic" in2="blur" operator="over" />
                    </filter>
                    <pattern id="hatch-mask" width="10" height="10" patternTransform="rotate(45 0 0)" patternUnits="userSpaceOnUse">
                      <line x1="0" y1="0" x2="0" y2="10" stroke="rgba(78, 222, 163, 0.3)" strokeWidth="1.5" />
                    </pattern>
                  </defs>

                  {/* Polygon Crown 101 */}
                  {showPolygons && (
                    <polygon
                      points="120,80 180,65 240,110 230,190 170,210 110,160"
                      fill={selectedTreeId === 101 ? "url(#hatch-mask)" : "rgba(16, 185, 129, 0.15)"}
                      stroke={selectedTreeId === 101 ? "#4EDEA3" : "#10B981"}
                      strokeWidth={selectedTreeId === 101 ? 2.5 : 1.2}
                      strokeDasharray={selectedTreeId === 101 ? "none" : "3,3"}
                      className="cursor-pointer hover:stroke-[#6EE7B7] hover:fill-[rgba(110,231,183,0.3)] transition-all"
                      onClick={() => setSelectedTreeId(101)}
                    />
                  )}
                  {showCentroids && <circle cx="175" cy="140" r={selectedTreeId === 101 ? 4 : 2.5} fill="#4EDEA3" />}

                  {/* Polygon Crown 102 */}
                  {showPolygons && (
                    <polygon
                      points="310,150 390,130 450,175 435,260 360,270 295,210"
                      fill={selectedTreeId === 102 ? "url(#hatch-mask)" : "rgba(16, 185, 129, 0.18)"}
                      stroke={selectedTreeId === 102 ? "#4EDEA3" : "#10B981"}
                      strokeWidth={selectedTreeId === 102 ? 2.5 : 1.4}
                      className="cursor-pointer hover:stroke-[#6EE7B7] transition-all"
                      onClick={() => setSelectedTreeId(102)}
                    />
                  )}
                  {showCentroids && <circle cx="370" cy="200" r={selectedTreeId === 102 ? 4 : 2.5} fill="#4EDEA3" />}

                  {/* Polygon Crown 103 */}
                  {showPolygons && (
                    <polygon
                      points="710,120 780,105 840,160 810,240 730,230 680,180"
                      fill={selectedTreeId === 103 ? "url(#hatch-mask)" : "rgba(16, 185, 129, 0.15)"}
                      stroke={selectedTreeId === 103 ? "#4EDEA3" : "#62DCAD"}
                      strokeWidth={selectedTreeId === 103 ? 2.5 : 1.5}
                      className="cursor-pointer hover:stroke-[#6EE7B7] transition-all"
                      onClick={() => setSelectedTreeId(103)}
                    />
                  )}
                  {showCentroids && <circle cx="760" cy="170" r={selectedTreeId === 103 ? 4 : 2.5} fill="#62DCAD" />}

                  {/* Polygon Crown 104 */}
                  {showPolygons && (
                    <polygon
                      points="620,390 700,370 760,420 740,510 660,520 600,460"
                      fill={selectedTreeId === 104 ? "url(#hatch-mask)" : "rgba(16, 185, 129, 0.14)"}
                      stroke={selectedTreeId === 104 ? "#4EDEA3" : "#10B981"}
                      strokeWidth={selectedTreeId === 104 ? 2.5 : 1.2}
                      className="cursor-pointer hover:stroke-[#6EE7B7] transition-all"
                      onClick={() => setSelectedTreeId(104)}
                    />
                  )}
                  {showCentroids && <circle cx="680" cy="450" r={selectedTreeId === 104 ? 4 : 2.5} fill="#4EDEA3" />}

                  {/* ACTIVE INSPECTED CROWN: Tree ID #402 */}
                  {showPolygons && (
                    <g filter="url(#emerald-glow)">
                      <polygon
                        points="460,280 540,260 620,295 640,380 590,440 500,430 440,360"
                        fill={showOverlap ? "url(#hatch-mask)" : "rgba(78, 222, 163, 0.25)"}
                        stroke="#4EDEA3"
                        strokeWidth={selectedTreeId === 402 ? 2.8 : 1.8}
                        className="cursor-pointer hover:stroke-[#6FFBBE] transition-all"
                        onClick={() => setSelectedTreeId(402)}
                      />
                      {/* Bounding Box Enclosure */}
                      <rect x="430" y="250" width="220" height="200" fill="none" stroke="#6FFBBE" strokeWidth="1" strokeDasharray="4,4" opacity="0.85" />
                      {/* Corner Anchors */}
                      <line x1="430" y1="250" x2="445" y2="250" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="430" y1="250" x2="430" y2="265" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="650" y1="250" x2="635" y2="250" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="650" y1="250" x2="650" y2="265" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="430" y1="450" x2="445" y2="450" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="430" y1="450" x2="430" y2="435" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="650" y1="450" x2="635" y2="450" stroke="#6FFBBE" strokeWidth="2" />
                      <line x1="650" y1="450" x2="650" y2="435" stroke="#6FFBBE" strokeWidth="2" />
                    </g>
                  )}

                  {/* Centroid Target Pin */}
                  {showCentroids && (
                    <g>
                      <circle cx="535" cy="355" r="4" fill="#6FFBBE" />
                      <circle cx="535" cy="355" r="10" fill="none" stroke="#6FFBBE" strokeWidth="1.2" />
                      <line x1="535" y1="340" x2="535" y2="370" stroke="#6FFBBE" strokeWidth="1" />
                      <line x1="520" y1="355" x2="550" y2="355" stroke="#6FFBBE" strokeWidth="1" />
                      <circle cx="535" cy="355" r="58" fill="none" stroke="rgba(110, 231, 183, 0.45)" strokeWidth="0.8" strokeDasharray="2,4" />
                      <text x="600" y="350" fill="#6FFBBE" fontFamily="JetBrains Mono" fontSize="10" letterSpacing="0.05em">
                        r = 3.3m
                      </text>
                    </g>
                  )}
                </svg>

                {/* Floating Active Tooltip HUD Card */}
                <div className="absolute top-6 right-6 md:top-8 md:right-8 max-w-xs p-4 rounded-xl bg-[#0A0F0D]/95 border border-[#10B981]/50 backdrop-blur-xl shadow-[0_16px_40px_rgba(0,0,0,0.85)] z-20">
                  <div className="flex items-center justify-between pb-2 border-b border-[#3C4A42]/40">
                    <span className="font-mono-telemetry text-xs text-[#10B981] font-bold">
                      Tree ID #{selectedTree.id}
                    </span>
                    <span className="px-1.5 py-0.5 rounded bg-[#10B981]/15 text-[9px] font-mono-telemetry text-[#6EE7B7] border border-[#10B981]/30">
                      SAM2 VALIDATED
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-2 font-mono-telemetry text-xs">
                    <div className="font-body-ui text-sm text-[#F8FAFC] font-medium italic">
                      {selectedTree.species} <span className="text-[#86948A] not-italic text-xs">({selectedTree.speciesCommon})</span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#3C4A42]/30">
                      <div>
                        <span className="text-[#86948A] block text-[9px] uppercase">CROWN AREA</span>
                        <span className="text-[#F8FAFC] font-semibold text-sm">{selectedTree.area} m²</span>
                      </div>
                      <div>
                        <span className="text-[#86948A] block text-[9px] uppercase">DIAMETER</span>
                        <span className="text-[#F8FAFC] font-semibold text-sm">{selectedTree.diameter} m</span>
                      </div>
                      <div>
                        <span className="text-[#86948A] block text-[9px] uppercase">CONFIDENCE</span>
                        <span className="text-[#10B981] font-semibold text-sm">{selectedTree.confidence}%</span>
                      </div>
                      <div>
                        <span className="text-[#86948A] block text-[9px] uppercase">HEIGHT EST.</span>
                        <span className="text-[#F8FAFC] font-semibold text-sm">{selectedTree.height} m</span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-[#3C4A42]/30 flex items-center justify-between text-xs">
                      <span className="text-[#86948A] text-[10px]">HEALTH (NDVI)</span>
                      <span className="text-[#6EE7B7] font-semibold">
                        {selectedTree.ndvi} ({selectedTree.status})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Left Map Tools Ribbon */}
                <div className="absolute bottom-4 left-4 flex items-center gap-1.5 p-1.5 rounded-lg bg-[#0A0F0D]/90 border border-[#3C4A42]/60 backdrop-blur-md z-10">
                  <button
                    onClick={() => setZoomLevel((z) => Math.min(z + 20, 180))}
                    className="p-1.5 rounded hover:bg-[#1C211E] text-[#94A3B8] hover:text-[#10B981] transition-colors cursor-pointer"
                    title="Zoom In"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <button
                    onClick={() => setZoomLevel((z) => Math.max(z - 20, 80))}
                    className="p-1.5 rounded hover:bg-[#1C211E] text-[#94A3B8] hover:text-[#10B981] transition-colors cursor-pointer"
                    title="Zoom Out"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  </button>
                  <span className="w-[1px] h-4 bg-[#3C4A42]"></span>
                  <button
                    onClick={() => setSelectedTreeId(402)}
                    className="p-1.5 rounded bg-[#1C211E] text-[#10B981] cursor-pointer"
                    title="Focus Tree #402"
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                </div>
              </div>

              {/* Side Inspector Controls Dock */}
              <div className="lg:col-span-3 bg-[#0F1412]/95 border-t lg:border-t-0 lg:border-l border-[#3C4A42]/40 p-5 flex flex-col justify-between backdrop-blur-md">
                <div className="space-y-6">
                  {/* Header */}
                  <div>
                    <div className="flex items-center justify-between">
                      <span className="font-mono-telemetry text-xs text-[#10B981] font-bold uppercase tracking-wider">
                        Layer Controls
                      </span>
                      <span className="font-mono-telemetry text-[10px] text-[#86948A]">v3.4 Engine</span>
                    </div>
                    <p className="font-body-ui text-xs text-[#86948A] mt-1">
                      Configure active neural segmentation masks and multi-spectral telemetry layers.
                    </p>
                  </div>

                  {/* Layer Toggles */}
                  <div className="space-y-2.5">
                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#1C211E]/70 border border-[#3C4A42]/40 hover:border-[#10B981]/50 transition-colors cursor-pointer">
                      <span className="font-body-ui text-xs font-medium text-[#F8FAFC]">SAM2 Polygons</span>
                      <input
                        type="checkbox"
                        checked={showPolygons}
                        onChange={(e) => setShowPolygons(e.target.checked)}
                        className="accent-[#10B981] w-4 h-4 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#1C211E]/70 border border-[#3C4A42]/40 hover:border-[#10B981]/50 transition-colors cursor-pointer">
                      <span className="font-body-ui text-xs font-medium text-[#F8FAFC]">Crown Centroids</span>
                      <input
                        type="checkbox"
                        checked={showCentroids}
                        onChange={(e) => setShowCentroids(e.target.checked)}
                        className="accent-[#10B981] w-4 h-4 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#1C211E]/70 border border-[#3C4A42]/40 hover:border-[#10B981]/50 transition-colors cursor-pointer">
                      <span className="font-body-ui text-xs font-medium text-[#F8FAFC]">Overlap Hatching</span>
                      <input
                        type="checkbox"
                        checked={showOverlap}
                        onChange={(e) => setShowOverlap(e.target.checked)}
                        className="accent-[#10B981] w-4 h-4 cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#1C211E]/70 border border-[#3C4A42]/40 hover:border-[#10B981]/50 transition-colors cursor-pointer">
                      <span className="font-body-ui text-xs font-medium text-[#F8FAFC]">NDVI Vegetation Shift</span>
                      <input
                        type="checkbox"
                        checked={showNdvi}
                        onChange={(e) => setShowNdvi(e.target.checked)}
                        className="accent-[#10B981] w-4 h-4 cursor-pointer"
                      />
                    </label>
                  </div>

                  {/* Canopy Density Meter */}
                  <div className="pt-4 border-t border-[#3C4A42]/30 space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="font-mono-telemetry text-xs text-[#86948A] uppercase">Canopy Cover (Union)</span>
                      <span className="font-mono-telemetry text-sm font-bold text-[#10B981]">78.4%</span>
                    </div>
                    {/* Segmented meter bar */}
                    <div className="w-full h-2.5 rounded-full bg-[#1C211E] overflow-hidden flex border border-[#3C4A42]/50">
                      <div className="h-full bg-gradient-to-r from-[#059669] to-[#10B981]" style={{ width: "78.4%" }}></div>
                      <div className="h-full bg-[#313633]" style={{ width: "21.6%" }}></div>
                    </div>
                    <div className="flex justify-between font-mono-telemetry text-[10px] text-[#86948A]">
                      <span>GROUND: 21.6%</span>
                      <span>CANOPY: 78.4%</span>
                    </div>
                  </div>
                </div>

                {/* Primary Actions */}
                <div className="pt-6 mt-6 border-t border-[#3C4A42]/30 space-y-2.5">
                  <button
                    onClick={onExploreDemo}
                    className="w-full py-2.5 rounded-lg bg-[#10B981] text-[#050807] font-space font-semibold text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:bg-[#6EE7B7] transition-all cursor-pointer shadow-[0_0_16px_rgba(16,185,129,0.25)]"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="5 3 19 12 5 21 5 3"/>
                    </svg>
                    <span>Explore in Full MapLibre</span>
                  </button>

                  <button
                    onClick={onLaunchWorkspace}
                    className="w-full py-2.5 rounded-lg bg-[#1C211E] border border-[#3C4A42] text-[#DFE4E0] font-mono-telemetry text-xs tracking-wider uppercase flex items-center justify-center gap-2 hover:border-[#10B981] hover:text-[#10B981] transition-all cursor-pointer"
                  >
                    <span>Analyze Custom Image</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 4-STEP TECHNICAL WORKFLOW PIPELINE ──────────────────────────── */}
      <section id="workflow" className="py-20 bg-[#080C0A] border-t border-b border-[#3C4A42]/30">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="max-w-2xl mb-14">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#181D1A] border border-[#3C4A42] text-[#10B981] font-mono-telemetry text-xs uppercase mb-3">
              <span>End-to-End Photogrammetry</span>
            </div>
            <h2 className="font-headline-lg text-3xl md:text-4xl text-[#F8FAFC]">
              Precision Pipeline Architecture
            </h2>
            <p className="font-body-ui text-base text-[#94A3B8] mt-2">
              From uncalibrated raw aerial orthophotos to topological GIS polygons with strict geometric union metrics.
            </p>
          </div>

          {/* 4 Step Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Step 01 */}
            <div
              onMouseEnter={() => setActiveWorkflowStage(0)}
              className={`p-6 rounded-xl bg-[#0F1412] border transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeWorkflowStage === 0 ? "border-[#10B981] shadow-[0_0_24px_rgba(16,185,129,0.2)]" : "border-[#3C4A42]/40 hover:border-[#3C4A42]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono-telemetry text-xs text-[#10B981] font-bold">STAGE // 01</span>
                  <div className="w-8 h-8 rounded-lg bg-[#181D1A] flex items-center justify-center text-[#10B981]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/></svg>
                  </div>
                </div>
                <h3 className="font-space text-lg text-[#F8FAFC] font-semibold mb-2">
                  Ingestion & Orthorectification
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Automated GSD reslicing, dynamic pyramidal GeoTIFF tiling, coordinate transformation, and optional KML polygon clipping.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 font-mono-telemetry text-[11px] text-[#7AAA80]">
                COGs • Multi-band RGB/NIR
              </div>
            </div>

            {/* Step 02 */}
            <div
              onMouseEnter={() => setActiveWorkflowStage(1)}
              className={`p-6 rounded-xl bg-[#0F1412] border transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeWorkflowStage === 1 ? "border-[#10B981] shadow-[0_0_24px_rgba(16,185,129,0.2)]" : "border-[#3C4A42]/40 hover:border-[#3C4A42]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono-telemetry text-xs text-[#10B981] font-bold">STAGE // 02</span>
                  <div className="w-8 h-8 rounded-lg bg-[#181D1A] flex items-center justify-center text-[#10B981]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
                  </div>
                </div>
                <h3 className="font-space text-lg text-[#F8FAFC] font-semibold mb-2">
                  DeepForest Adaptive Detection
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Multi-scale crown bounding anchors with cross-tile Non-Maximum Suppression (NMS) and cluster dedup to eliminate edge duplication.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 font-mono-telemetry text-[11px] text-[#7AAA80]">
                PyTorch • 15% IoU Stride
              </div>
            </div>

            {/* Step 03 */}
            <div
              onMouseEnter={() => setActiveWorkflowStage(2)}
              className={`p-6 rounded-xl bg-[#0F1412] border transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeWorkflowStage === 2 ? "border-[#10B981] shadow-[0_0_24px_rgba(16,185,129,0.2)]" : "border-[#3C4A42]/40 hover:border-[#3C4A42]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono-telemetry text-xs text-[#10B981] font-bold">STAGE // 03</span>
                  <div className="w-8 h-8 rounded-lg bg-[#181D1A] flex items-center justify-center text-[#10B981]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 2 7 12 12 22 7 12 2"/></svg>
                  </div>
                </div>
                <h3 className="font-space text-lg text-[#F8FAFC] font-semibold mb-2">
                  Meta SAM2 Instance Segmentation
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Promptable foundation model boundary tracing generating smooth, edge-refined discrete polygonal contours for each individual tree instance.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 font-mono-telemetry text-[11px] text-[#7AAA80]">
                Segment Anything 2 • Contours
              </div>
            </div>

            {/* Step 04 */}
            <div
              onMouseEnter={() => setActiveWorkflowStage(3)}
              className={`p-6 rounded-xl bg-[#0F1412] border transition-all duration-200 flex flex-col justify-between cursor-pointer ${
                activeWorkflowStage === 3 ? "border-[#10B981] shadow-[0_0_24px_rgba(16,185,129,0.2)]" : "border-[#3C4A42]/40 hover:border-[#3C4A42]"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <span className="font-mono-telemetry text-xs text-[#10B981] font-bold">STAGE // 04</span>
                  <div className="w-8 h-8 rounded-lg bg-[#181D1A] flex items-center justify-center text-[#10B981]">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 20V10M12 20V4M6 20v-6"/></svg>
                  </div>
                </div>
                <h3 className="font-space text-lg text-[#F8FAFC] font-semibold mb-2">
                  Metrics & Union Area Audit
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Planar geometric union dissolution for accurate canopy cover calculation, confidence classification, and GIS vector streaming.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 font-mono-telemetry text-[11px] text-[#7AAA80]">
                Shapely • GeoJSON • Shapefile
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SCIENTIFIC RIGOR & TRANSPARENCY MATRIX ───────────────────────── */}
      <section id="transparency" className="py-20 md:py-28">
        <div className="max-w-7xl mx-auto px-6 md:px-12">
          <div className="max-w-3xl mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#181D1A] border border-[#3C4A42] text-[#10B981] font-mono-telemetry text-xs uppercase mb-3">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              <span>Scientific Rigor & Validation</span>
            </div>
            <h2 className="font-headline-lg text-3xl md:text-4xl text-[#F8FAFC]">
              Transparent Edge-Case Disclosures
            </h2>
            <p className="font-body-ui text-base text-[#94A3B8] mt-2">
              Earth observation intelligence demands absolute honesty regarding sensor resolution bounds, seasonal phenology, and canopy occlusion.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1 */}
            <div className="p-6 rounded-xl bg-[#0A0F0D] border border-[#3C4A42]/40 flex flex-col justify-between shadow-lg hover:border-[#10B981]/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#182B1B] flex items-center justify-center text-[#10B981] mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
                </div>
                <h3 className="font-space text-base text-[#F8FAFC] font-semibold mb-2">
                  GSD Resolution Thresholds
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Sub-10cm/px drone imagery delivers optimal single-tree crown delineation. At 30cm+ satellite resolutions (e.g. WorldView-3), individual crowns coalesce into aggregate canopy clusters; our pipeline switches gracefully to fractional density estimation.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 flex items-center justify-between font-mono-telemetry text-xs">
                <span className="text-[#86948A]">DRONE OPTIMAL:</span>
                <span className="text-[#10B981] font-bold">≤ 0.08m GSD</span>
              </div>
            </div>

            {/* Card 2 */}
            <div className="p-6 rounded-xl bg-[#0A0F0D] border border-[#3C4A42]/40 flex flex-col justify-between shadow-lg hover:border-[#6EE7B7]/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#182B1B] flex items-center justify-center text-[#6EE7B7] mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                </div>
                <h3 className="font-space text-base text-[#F8FAFC] font-semibold mb-2">
                  Deciduous Leaf-Off Dormancy
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Winter leaf loss causes apparent crown shrinkage in pure RGB photogrammetry. CanopyLens provides calibrated phenology correction models paired with optional multi-temporal fusion to estimate true crown envelope dimensions during dormancy.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 flex items-center justify-between font-mono-telemetry text-xs">
                <span className="text-[#86948A]">PHENOLOGY MODEL:</span>
                <span className="text-[#6EE7B7] font-bold">LiDAR Assisted</span>
              </div>
            </div>

            {/* Card 3 */}
            <div className="p-6 rounded-xl bg-[#0A0F0D] border border-[#3C4A42]/40 flex flex-col justify-between shadow-lg hover:border-[#059669]/40 transition-colors">
              <div>
                <div className="w-10 h-10 rounded-lg bg-[#182B1B] flex items-center justify-center text-[#059669] mb-4">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18"/></svg>
                </div>
                <h3 className="font-space text-base text-[#F8FAFC] font-semibold mb-2">
                  Understory Crown Suppression
                </h3>
                <p className="font-body-ui text-xs text-[#94A3B8] leading-relaxed">
                  Overhead optical sensors cannot detect sub-canopy saplings shielded beneath dense dominant overstory crowns. We explicitly report overstory canopy cover rather than total stem density to maintain scientific truth.
                </p>
              </div>
              <div className="mt-6 pt-4 border-t border-[#3C4A42]/30 flex items-center justify-between font-mono-telemetry text-xs">
                <span className="text-[#86948A]">STRATA BIAS AUDIT:</span>
                <span className="text-[#10B981] font-bold">Overstory Explicit</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── DIRECT STUDIO WORKSPACE SECTION ─────────────────────────────── */}
      <section id="workspace" className="py-20 md:py-28 bg-[#0B120E] border-t border-[#3C4A42]/40 relative">
        <div className="max-w-4xl mx-auto px-6 md:px-12">
          <div className="text-center mb-10">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded bg-[#181D1A] border border-[#3C4A42] text-[#10B981] font-mono-telemetry text-xs uppercase mb-3">
              <span>Direct Analysis Workstation</span>
            </div>
            <h2 className="font-headline-lg text-3xl md:text-4xl text-[#F8FAFC]">
              Analyze Your Aerial Orthomosaics
            </h2>
            <p className="font-body-ui text-sm text-[#94A3B8] max-w-lg mx-auto mt-2">
              Upload GeoTIFF, PNG, or JPEG aerial images to run the DeepForest + SAM2 neural segmentation pipeline.
            </p>
          </div>

          <div className="p-8 rounded-2xl bg-[#0F1A12]/95 border border-[#3C4A42]/60 shadow-[0_24px_64px_rgba(0,0,0,0.85)] backdrop-blur-xl">
            <UploadPanel onJobCreated={onJobCreated} />
          </div>
        </div>
      </section>

      {/* ── CALL TO ACTION BANNER ───────────────────────────────────────── */}
      <section className="py-16 bg-[#181D1A]/70 border-t border-[#3C4A42]/40">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <h3 className="font-display-hero text-2xl md:text-3xl text-[#F8FAFC] font-normal">
              Ready to vectorize your orthomosaics?
            </h3>
            <p className="font-body-ui text-sm text-[#94A3B8] mt-1">
              Upload any GeoTIFF or standard aerial image to detect tree crowns and extract non-overlapping GIS cover.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-4 flex-shrink-0">
            <button
              onClick={onLaunchWorkspace}
              className="px-6 py-3.5 rounded-lg bg-[#10B981] text-[#050807] font-space font-semibold text-xs tracking-wider uppercase hover:bg-[#6EE7B7] transition-all flex items-center gap-2 cursor-pointer shadow-[0_0_20px_rgba(16,185,129,0.3)]"
            >
              <span>Launch Studio</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button
              onClick={onExploreDemo}
              className="px-6 py-3.5 rounded-lg bg-[#1C211E] border border-[#3C4A42] text-[#DFE4E0] font-space font-medium text-xs tracking-wider uppercase hover:border-[#10B981] hover:text-[#10B981] transition-all flex items-center gap-2 cursor-pointer"
            >
              <span>Sample Demo</span>
            </button>
          </div>
        </div>
      </section>

      {/* ── TECHNICAL FOOTER ────────────────────────────────────────────── */}
      <footer className="w-full bg-[#070B09] border-t border-[#3C4A42]/30 py-12">
        <div className="max-w-7xl mx-auto px-6 md:px-12 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col gap-1 text-center md:text-left">
            <span className="font-space text-base font-bold text-[#F8FAFC] flex items-center gap-2 justify-center md:justify-start">
              CanopyLens
              <span className="font-mono-telemetry text-xs text-[#10B981] font-normal">v3.4.2</span>
            </span>
            <p className="font-body-ui text-xs text-[#86948A] max-w-xl">
              © 2026 CanopyLens Spatial Intelligence. Tree crown segmentation algorithms verified under ISO 19115-1 geospatial metadata standards.
            </p>
          </div>

          <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2 font-mono-telemetry text-xs">
            <a href="https://github.com/sujayx07/CanopyLens" target="_blank" rel="noreferrer" className="text-[#10B981] hover:underline">
              GitHub Repository
            </a>
            <span className="text-[#3C4A42]">|</span>
            <a href="https://iphoneindiatoday--canopylens-fastapi-app.modal.run/docs" target="_blank" rel="noreferrer" className="text-[#86948A] hover:text-[#F8FAFC]">
              Swagger API
            </a>
            <span className="text-[#3C4A42]">|</span>
            <span className="text-[#86948A]">DeepForest 2.1</span>
            <span className="text-[#3C4A42]">|</span>
            <span className="text-[#86948A]">Meta SAM2 Hiera</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
