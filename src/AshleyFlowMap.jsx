import { useState, useMemo } from "react";

// ─── Constants ────────────────────────────────────────────
const NW = 115, NH = 50, NR = 4;
const CW = 1270, CH = 588;
const f = v => +v.toFixed(1);

// ─── Visual helpers ────────────────────────────────────────
const strokeW = p => Math.max(1.5, (p / 100) * 14);
const edgeColor = p =>
  p >= 70 ? "#0284c7" : p >= 40 ? "#2563eb" : p >= 20 ? "#6366f1" : "#8b5cf6";

// ─── Node color palettes ───────────────────────────────────
const FILL = {
  input:   "#dbeafe",
  cutting: "#ede9fe",
  cell:    "#d1fae5",
  plant3:  "#ffedd5",
  process: "#dbeafe",
  output:  "#dcfce7",
};
const BORDER = {
  input:   "#3b82f6",
  cutting: "#8b5cf6",
  cell:    "#10b981",
  plant3:  "#f97316",
  process: "#3b82f6",
  output:  "#22c55e",
};
const TCOLOR = {
  input:   "#1e3a5f",
  cutting: "#3b0764",
  cell:    "#064e3b",
  plant3:  "#7c2d12",
  process: "#1e3a5f",
  output:  "#14532d",
};

// ─── Node definitions (cx, cy = center) ────────────────────
const NODES = [
  { id:"rawboard",     label:"Raw Board",          sub:null,                               x:68,   y:184, t:"input",   w:NW  },
  { id:"lamination",   label:"Lamination 2",        sub:null,                               x:68,   y:434, t:"input",   w:NW  },
  { id:"jksaws",       label:"JK Saws",             sub:"3 machines",                       x:232,  y:110, t:"cutting", w:NW  },
  { id:"angularsaws",  label:"Angular Saws",         sub:"3 machines",                       x:232,  y:247, t:"cutting", w:NW  },
  { id:"drawercells",  label:"Drawer Cells",         sub:"2 machines",                       x:232,  y:364, t:"cell",    w:NW  },
  { id:"bedrails",     label:"Bed Rails",            sub:"1 line",                           x:232,  y:453, t:"cell",    w:NW  },
  { id:"plant3",       label:"Plant 3",              sub:"Contour · Stuff Cut · Narrow Rails", x:415, y:46, t:"plant3",  w:170 },
  { id:"drilling",     label:"Drilling",             sub:"2, 4-2",                           x:565,  y:124, t:"process", w:NW  },
  { id:"routers",      label:"Routers",              sub:"8 machines",                       x:565,  y:262, t:"process", w:NW  },
  { id:"foiling",      label:"Foiling / Tenoning",   sub:"2/0/2",                            x:415,  y:344, t:"process", w:NW  },
  { id:"edgebanding",  label:"Edge Banding",          sub:"24/2s",                            x:415,  y:424, t:"process", w:NW  },
  { id:"offsetsander", label:"Offset Sander",         sub:"Gang Rip / Chop",                  x:415,  y:504, t:"process", w:148 },
  { id:"mearing",      label:"Mearing 2",            sub:null,                               x:686,  y:342, t:"process", w:NW  },
  { id:"framing",      label:"Framing 3",            sub:null,                               x:804,  y:214, t:"process", w:NW  },
  { id:"dovetail",     label:"Dovetail 4",           sub:null,                               x:804,  y:400, t:"process", w:NW  },
  { id:"assembly",     label:"Assembly",              sub:null,                               x:944,  y:300, t:"output",  w:NW  },
  { id:"finishedgoods",label:"Finished Goods",        sub:null,                               x:1094, y:300, t:"output",  w:NW  },
];

// ─── Edge definitions ──────────────────────────────────────
const EDGES = [
  { from:"rawboard",     to:"jksaws",       pct:80  },
  { from:"rawboard",     to:"angularsaws",  pct:15  },
  { from:"lamination",   to:"drawercells",  pct:85  },
  { from:"lamination",   to:"bedrails",     pct:100 },
  { from:"jksaws",       to:"plant3",       pct:41  },
  { from:"jksaws",       to:"drilling",     pct:26  },
  { from:"jksaws",       to:"routers",      pct:10  },
  { from:"jksaws",       to:"foiling",      pct:6   },
  { from:"angularsaws",  to:"plant3",       pct:22  },
  { from:"angularsaws",  to:"drilling",     pct:40  },
  { from:"angularsaws",  to:"routers",      pct:20  },
  { from:"angularsaws",  to:"foiling",      pct:9   },
  { from:"angularsaws",  to:"edgebanding",  pct:8   },
  { from:"angularsaws",  to:"offsetsander", pct:8   },
  { from:"drawercells",  to:"assembly",     pct:92  },
  { from:"bedrails",     to:"foiling",      pct:100 },
  { from:"plant3",       to:"drilling",     pct:40  },
  { from:"plant3",       to:"routers",      pct:5   },
  { from:"drilling",     to:"routers",      pct:53  },
  { from:"drilling",     to:"mearing",      pct:7   },
  { from:"routers",      to:"mearing",      pct:22  },
  { from:"routers",      to:"foiling",      pct:6   },
  { from:"routers",      to:"assembly",     pct:49  },
  { from:"foiling",      to:"mearing",      pct:22  },
  { from:"foiling",      to:"edgebanding",  pct:20  },
  { from:"foiling",      to:"assembly",     pct:15  },
  { from:"foiling",      to:"framing",      pct:11  },
  { from:"edgebanding",  to:"mearing",      pct:11  },
  { from:"edgebanding",  to:"assembly",     pct:8   },
  { from:"offsetsander", to:"assembly",     pct:100 },
  { from:"mearing",      to:"framing",      pct:10  },
  { from:"mearing",      to:"assembly",     pct:88  },
  { from:"framing",      to:"dovetail",     pct:35  },
  { from:"framing",      to:"assembly",     pct:3   },
  { from:"dovetail",     to:"assembly",     pct:100 },
  { from:"assembly",     to:"finishedgoods",pct:100 },
];

// ─── Path computation ─────────────────────────────────────
function buildPaths(nodes, edges) {
  const nm = {};
  nodes.forEach(n => nm[n.id] = n);

  // Slot tracking for staggered exits/entries
  const outList = {}, inList = {};
  nodes.forEach(n => { outList[n.id] = []; inList[n.id] = []; });
  edges.forEach((e, i) => { outList[e.from].push(i); inList[e.to].push(i); });

  return edges.map((e, i) => {
    const s = nm[e.from], t = nm[e.to];

    const oi = outList[e.from].indexOf(i), oc = outList[e.from].length;
    const ii = inList[e.to].indexOf(i),   ic = inList[e.to].length;

    // Vertical stagger spacing (capped so edges stay within node height)
    const oSp = Math.min((NH - 8) / Math.max(oc, 1), 10);
    const iSp = Math.min((NH - 8) / Math.max(ic, 1), 10);
    const oOff = oc > 1 ? (oi - (oc - 1) / 2) * oSp : 0;
    const iOff = ic > 1 ? (ii - (ic - 1) / 2) * iSp : 0;

    const sx = s.x + s.w / 2,  sy = s.y + oOff;
    const tx = t.x - t.w / 2,  ty = t.y + iOff;

    const adx = Math.abs(tx - sx);
    const ady = Math.abs(ty - sy);

    // Control point tension: stretch more for near-vertical edges
    const tension = adx < 80 ? 0.7 : 0.42;
    const c1x = f(sx + adx * tension), c1y = f(sy);
    const c2x = f(tx - adx * tension), c2y = f(ty);

    const d = `M${f(sx)},${f(sy)} C${c1x},${c1y} ${c2x},${c2y} ${f(tx)},${f(ty)}`;

    // Bezier midpoint at t=0.5
    const B = (a, b, c2v, d2) => a * 0.125 + b * 0.375 + c2v * 0.375 + d2 * 0.125;
    const mx = Math.round(B(sx, +c1x, +c2x, tx));
    const my = Math.round(B(sy, +c1y, +c2y, ty));

    return { d, mx, my, pct: e.pct, from: e.from, to: e.to };
  });
}

// ─── Main component ────────────────────────────────────────
export default function AshleyFlowMap() {
  const [hov, setHov]   = useState(null);   // hovered node id
  const [hovE, setHovE] = useState(null);   // hovered edge index

  const nm    = useMemo(() => { const m = {}; NODES.forEach(n => m[n.id] = n); return m; }, []);
  const paths = useMemo(() => buildPaths(NODES, EDGES), []);

  // ── Bottleneck scoring ──
  // Score = incoming edge count * total incoming volume — higher = more convergence pressure
  // Exclude aggregate endpoints (assembly, finishedgoods) — they converge by design
  const EXCLUDED = new Set(["assembly", "finishedgoods"]);
  const bottleneck = useMemo(() => {
    const scores = {};
    NODES.forEach(n => {
      if (EXCLUDED.has(n.id)) { scores[n.id] = null; return; }
      const inEdges = EDGES.filter(e => e.to === n.id);
      const inVol = inEdges.reduce((a, e) => a + e.pct, 0);
      scores[n.id] = inEdges.length * inVol;
    });
    const scoredVals = Object.values(scores).filter(v => v !== null);
    const min = Math.min(...scoredVals), max = Math.max(...scoredVals);
    const range = max - min || 1;
    const norm = {};
    NODES.forEach(n => {
      norm[n.id] = scores[n.id] === null ? null : (scores[n.id] - min) / range;
    });
    return norm;
  }, []);

  // Map 0–1 score to green→yellow→red
  const bnColor = (score) => {
    if (score <= 0.5) {
      // green to yellow
      const t = score / 0.5;
      const r = Math.round(34 + t * (202 - 34));
      const g = Math.round(197 + t * (138 - 197));
      const b = Math.round(94 + t * (4 - 94));
      return `rgb(${r},${g},${b})`;
    } else {
      // yellow to red
      const t = (score - 0.5) / 0.5;
      const r = Math.round(202 + t * (220 - 202));
      const g = Math.round(138 - t * 138);
      const b = Math.round(4);
      return `rgb(${r},${g},${b})`;
    }
  };
  const bnWidth = (score) => 1.5 + score * 2.5; // 1.5px to 4px

  const isConn = (nid, ei) => EDGES[ei].from === nid || EDGES[ei].to === nid;
  const eOpacity = ei => {
    if (!hov && hovE == null) return 1;
    if (hovE === ei || (hov && isConn(hov, ei))) return 1;
    return 0.07;
  };

  // Stats for info bar
  const totalEdges   = EDGES.length;
  const avgPct       = Math.round(EDGES.reduce((a, e) => a + e.pct, 0) / totalEdges);
  const highFlowEdges = EDGES.filter(e => e.pct >= 50).length;

  return (
    <div style={{
      background: "#f8fafc",
      minHeight: "100vh",
      padding: "16px 14px 14px",
      fontFamily: "'DM Mono', 'Courier New', monospace",
    }}>

      {/* ── Header ── */}
      <div style={{ marginBottom: 12, borderBottom: "1px solid #cbd5e1", paddingBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span style={{ color: "#0284c7", fontSize: 11, letterSpacing: 3, textTransform: "uppercase", fontWeight: 700 }}>
            KINETIC VISION
          </span>
          <span style={{ color: "#94a3b8", fontSize: 11 }}>|</span>
          <span style={{ color: "#1e293b", fontSize: 15, fontWeight: 700, letterSpacing: 0.5 }}>
            Ashley Furniture — Arcadia Production Flow Map
          </span>
        </div>
        <div style={{ display: "flex", gap: 20, marginTop: 6, alignItems: "center" }}>
          <span style={{ color: "#64748b", fontSize: 10, letterSpacing: 1 }}>
            CONNECTOR WIDTH ∝ ROUTING VOLUME %
          </span>
          <span style={{ color: "#94a3b8", fontSize: 10 }}>·</span>
          <span style={{ color: "#64748b", fontSize: 10 }}>
            {totalEdges} ROUTING PATHS &nbsp;·&nbsp; AVG {avgPct}% &nbsp;·&nbsp; {highFlowEdges} HIGH-VOLUME FLOWS (&gt;50%)
          </span>
          <span style={{ color: "#64748b", fontSize: 10, marginLeft: "auto" }}>
            HOVER NODES OR EDGES FOR DETAIL
          </span>
        </div>
      </div>

      {/* ── SVG Canvas ── */}
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${CW} ${CH}`} style={{ display: "block", width: "100%", height: "auto" }}>
          <defs>
            {/* Arrow markers */}
            <marker id="arr"  markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8" />
            </marker>
            <marker id="arrH" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#0284c7" />
            </marker>

            {/* Glow filter for highlighted elements */}
            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>

            {/* Subtle scanline pattern */}
            <pattern id="scanlines" x="0" y="0" width="1" height="4" patternUnits="userSpaceOnUse">
              <rect width="1" height="1" fill="#000000" opacity="0.01"/>
            </pattern>
          </defs>

          {/* Base background */}
          <rect width={CW} height={CH} fill="#ffffff"/>
          <rect width={CW} height={CH} fill="url(#scanlines)"/>

          {/* Grid */}
          {[...Array(18)].map((_, i) => (
            <line key={"gx"+i} x1={(i+1)*70} y1={0} x2={(i+1)*70} y2={CH}
              stroke="#e2e8f0" strokeWidth={1}/>
          ))}
          {[...Array(8)].map((_, i) => (
            <line key={"gy"+i} x1={0} y1={(i+1)*70} x2={CW} y2={(i+1)*70}
              stroke="#e2e8f0" strokeWidth={1}/>
          ))}

          {/* Column zone hints */}
          <rect x={5} y={5} width={155} height={CH-10} rx={3}
            fill="#eff6ff" stroke="#bfdbfe" strokeWidth={1}/>
          <rect x={168} y={5} width={120} height={CH-10} rx={3}
            fill="#f5f3ff" stroke="#ddd6fe" strokeWidth={1}/>
          <rect x={916} y={5} width={350} height={CH-10} rx={3}
            fill="#f0fdf4" stroke="#bbf7d0" strokeWidth={1}/>

          {/* Column labels */}
          {[["INPUT", 78], ["CUTTING", 232], ["PROCESS", 560], ["FINISHING", 780], ["OUTPUT", 1010]].map(([lbl, x]) => (
            <text key={lbl} x={x} y={570} textAnchor="middle" fontSize={8}
              fill="#64748b" letterSpacing={2} fontFamily="'DM Mono',monospace">{lbl}</text>
          ))}

          {/* ── Draw edges (below nodes) ── */}
          {paths.map((p, i) => {
            const op   = eOpacity(i);
            const hi   = hovE === i || (hov && isConn(hov, i));
            const clr  = hi ? "#0284c7" : edgeColor(p.pct);
            const sW   = strokeW(p.pct);
            const showLbl = p.pct >= 35 || hi;

            return (
              <g key={i}>
                {/* Invisible wide hit area */}
                <path d={p.d} fill="none" stroke="transparent"
                  strokeWidth={Math.max(sW + 10, 14)}
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHovE(i)}
                  onMouseLeave={() => setHovE(null)}/>

                {/* Glow layer for highlighted edges */}
                {hi && (
                  <path d={p.d} fill="none" stroke="#0284c7"
                    strokeWidth={sW + 4} opacity={0.15}
                    style={{ pointerEvents: "none" }}/>
                )}

                {/* Main edge line */}
                <path d={p.d} fill="none" stroke={clr} strokeWidth={sW}
                  opacity={op}
                  markerEnd={`url(#${hi ? "arrH" : "arr"})`}
                  style={{ pointerEvents: "none", transition: "opacity 0.12s" }}/>

                {/* Volume label */}
                {showLbl && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={p.mx - 14} y={p.my - 9} width={28} height={14} rx={2}
                      fill="#ffffff" fillOpacity={0.95} stroke={hi ? "#0284c7" : "#cbd5e1"} strokeWidth={0.5}/>
                    <text x={p.mx} y={p.my + 4} textAnchor="middle" fontSize={9}
                      fontWeight={700} fill={hi ? "#0284c7" : "#334155"}
                      fontFamily="'DM Mono',monospace">
                      {p.pct}%
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Draw nodes (above edges) ── */}
          {NODES.map(n => {
            const isH  = hov === n.id;
            const isC  = hov && hov !== n.id &&
              EDGES.some(e => (e.from === hov && e.to === n.id) || (e.to === hov && e.from === n.id));
            const dim  = hov && !isH && !isC;
            const nw   = n.w;
            const lx   = f(n.x - nw / 2);
            const ly   = f(n.y - NH / 2);

            return (
              <g key={n.id} transform={`translate(${lx},${ly})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHov(n.id)}
                onMouseLeave={() => setHov(null)}>

                {/* Glow backdrop when highlighted */}
                {(isH || isC) && (
                  <rect width={nw} height={NH} rx={NR}
                    fill={isH ? "#0284c7" : BORDER[n.t]}
                    opacity={0.12} filter="url(#glow)"/>
                )}

                {/* Bottleneck indicator ring */}
                {!isH && !isC && !dim && bottleneck[n.id] !== null && (
                  <rect width={nw} height={NH} rx={NR}
                    fill="none"
                    stroke={bnColor(bottleneck[n.id])}
                    strokeWidth={bnWidth(bottleneck[n.id])}
                    opacity={0.8}/>
                )}

                {/* Node body */}
                <rect width={nw} height={NH} rx={NR}
                  fill={FILL[n.t]}
                  stroke={isH ? "#0284c7" : isC ? BORDER[n.t] : bottleneck[n.id] !== null ? bnColor(bottleneck[n.id]) : "#cbd5e1"}
                  strokeWidth={isH ? 2 : bottleneck[n.id] !== null ? bnWidth(bottleneck[n.id]) : 1}
                  opacity={dim ? 0.15 : 1}
                  style={{ transition: "opacity 0.12s" }}/>

                {/* Top accent bar */}
                {!dim && (
                  <rect width={nw} height={2} rx={NR}
                    fill={BORDER[n.t]} opacity={isH ? 1 : 0.6}/>
                )}

                {/* Label */}
                <text x={nw / 2} y={n.sub ? 18 : NH / 2 + 5}
                  textAnchor="middle" fontSize={11} fontWeight={700}
                  fill={dim ? "#94a3b8" : TCOLOR[n.t]}
                  fontFamily="'DM Mono',monospace"
                  style={{ transition: "fill 0.12s" }}>
                  {n.label}
                </text>

                {/* Sub-label */}
                {n.sub && (
                  <text x={nw / 2} y={35} textAnchor="middle" fontSize={8.5}
                    fill={dim ? "#94a3b8" : TCOLOR[n.t]} opacity={dim ? 0.5 : 0.75}
                    fontFamily="'DM Mono',monospace">
                    {n.sub}
                  </text>
                )}
              </g>
            );
          })}

          {/* ── Edge hover tooltip ── */}
          {hovE !== null && (() => {
            const p   = paths[hovE];
            const e   = EDGES[hovE];
            const sN  = nm[e.from].label;
            const tN  = nm[e.to].label;
            const tW  = 210, tH = 26;
            const tipX = Math.min(Math.max(p.mx - tW / 2, 6), CW - tW - 6);
            const tipY = p.my > 60 ? p.my - 36 : p.my + 12;
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={tipX} y={tipY} width={tW} height={tH} rx={3}
                  fill="#ffffff" stroke="#0284c7" strokeWidth={1}/>
                <text x={tipX + tW / 2} y={tipY + 17} textAnchor="middle"
                  fontSize={10} fill="#1e293b" fontFamily="'DM Mono',monospace">
                  {sN} → {tN}: {e.pct}%
                </text>
              </g>
            );
          })()}

          {/* ── Node hover info panel ── */}
          {hov && (() => {
            const n     = nm[hov];
            const out   = EDGES.filter(e => e.from === hov);
            const inE   = EDGES.filter(e => e.to === hov);
            const outTotal = out.reduce((a, e) => a + e.pct, 0);
            const panelX = 8, panelY = CH - 90, panelW = 280, panelH = 82;
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={panelX} y={panelY} width={panelW} height={panelH} rx={4}
                  fill="#ffffff" stroke="#0284c7" strokeWidth={1} opacity={0.97}/>
                <text x={panelX + 10} y={panelY + 17} fontSize={10} fontWeight={700}
                  fill="#0284c7" fontFamily="'DM Mono',monospace">{n.label.toUpperCase()}</text>
                {n.sub && <text x={panelX + 10} y={panelY + 30} fontSize={8.5}
                  fill="#64748b" fontFamily="'DM Mono',monospace">{n.sub}</text>}
                <text x={panelX + 10} y={panelY + 46} fontSize={9}
                  fill="#334155" fontFamily="'DM Mono',monospace">
                  ↑ {inE.length} incoming route{inE.length !== 1 ? "s" : ""}
                </text>
                <text x={panelX + 10} y={panelY + 60} fontSize={9}
                  fill="#334155" fontFamily="'DM Mono',monospace">
                  ↓ {out.length} outgoing route{out.length !== 1 ? "s" : ""}
                  {out.length > 0 ? `  (${outTotal}% total distributed)` : ""}
                </text>
                {inE.slice(0, 2).map((e, i) => (
                  <text key={i} x={panelX + 145 + i * 65} y={panelY + 17}
                    fontSize={9} fill="#2563eb" textAnchor="middle" fontFamily="'DM Mono',monospace">
                    ← {nm[e.from].label.split(" ")[0]} {e.pct}%
                  </text>
                ))}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Legend ── */}
      <div style={{ display: "flex", gap: 16, marginTop: 10, flexWrap: "wrap", alignItems: "center",
        borderTop: "1px solid #cbd5e1", paddingTop: 10 }}>

        {/* Node type legend */}
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            ["input",   "RAW INPUT"],
            ["cutting", "CUTTING"],
            ["cell",    "DEDICATED CELL"],
            ["plant3",  "PLANT 3"],
            ["process", "PROCESS"],
            ["output",  "OUTPUT"],
          ].map(([t, lbl]) => (
            <div key={t} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{
                width: 10, height: 10, borderRadius: 2,
                background: FILL[t], border: `1px solid ${BORDER[t]}`
              }}/>
              <span style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, fontFamily: "'DM Mono',monospace" }}>
                {lbl}
              </span>
            </div>
          ))}
        </div>

        {/* Volume scale */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, fontFamily: "'DM Mono',monospace" }}>
            VOLUME SCALE:
          </span>
          {[[6, "6%"], [30, "30%"], [70, "70%"], [100, "100%"]].map(([pct, lbl]) => (
            <div key={pct} style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <svg width={34} height={14} style={{ display: "block" }}>
                <line x1={0} y1={7} x2={34} y2={7}
                  stroke={edgeColor(pct)} strokeWidth={strokeW(pct)} opacity={0.9}/>
              </svg>
              <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>{lbl}</span>
            </div>
          ))}
          <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 6 }}>
            <div style={{ width: 28, height: 2, background: "linear-gradient(to right, #8b5cf6, #2563eb, #0284c7)" }}/>
            <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>LOW → HIGH</span>
          </div>
        </div>
      </div>

      {/* ── Bottleneck legend ── */}
      <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, fontFamily: "'DM Mono',monospace" }}>
          BOTTLENECK RISK:
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: "#f8fafc", border: "2px solid #22c55e" }}/>
          <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>LOW</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: "#f8fafc", border: "2.5px solid #ca8a04" }}/>
          <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>MED</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 2, background: "#f8fafc", border: "3.5px solid #dc0004" }}/>
          <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>HIGH</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
          <div style={{ width: 40, height: 4, borderRadius: 2, background: "linear-gradient(to right, #22c55e, #ca8a04, #dc0004)" }}/>
          <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono',monospace" }}>BORDER = CONVERGENCE PRESSURE</span>
        </div>
      </div>

      {/* ── Footer note ── */}
      <div style={{ marginTop: 6, color: "#64748b", fontSize: 9, letterSpacing: 1, fontFamily: "'DM Mono',monospace" }}>
        NOTE: PERCENTAGES REPRESENT ROUTING SPLIT AT EACH WORK CENTER — NOT ABSOLUTE VOLUME.
        VALUES RECONSTRUCTED FROM SITE VISIT FLOW MAP. VERIFY WITH JONES / AS-400 DATA FOR EXACT FIGURES.
      </div>
    </div>
  );
}
