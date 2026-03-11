import { useState, useMemo } from "react";
import { FLOW_DATA, STATIONS, DEPARTMENTS } from "./flowData";

// ─── Layout constants ────────────────────────────────────────
const NODE_H = 44;
const NODE_R = 5;
const PAD_X = 60;
const PAD_Y = 40;
const COL_GAP = 40;
const ROW_GAP = 14;
const NUM_COLS = 6;
const f = v => +v.toFixed(1);

// ─── Color palettes ──────────────────────────────────────────
const DEPT_COLORS = {
  SAW:           { fill: "#dbeafe", border: "#3b82f6", text: "#1e3a5f" },
  "EDGE / FOIL": { fill: "#d1fae5", border: "#10b981", text: "#064e3b" },
  DRILL:         { fill: "#ede9fe", border: "#8b5cf6", text: "#3b0764" },
  ROUTER:        { fill: "#ffedd5", border: "#f97316", text: "#7c2d12" },
  DOVETAIL:      { fill: "#ccfbf1", border: "#14b8a6", text: "#134e4a" },
  FINISH:        { fill: "#fef3c7", border: "#f59e0b", text: "#78350f" },
  ASSEMBLY:      { fill: "#fce7f3", border: "#ec4899", text: "#831843" },
  "PRESS / MISC":{ fill: "#f1f5f9", border: "#64748b", text: "#1e293b" },
  "CUT / PROFILE":{ fill: "#e0f2fe", border: "#0ea5e9", text: "#0c4a6e" },
  HARDWARE:      { fill: "#fef2f2", border: "#ef4444", text: "#7f1d1d" },
  STAGING:       { fill: "#f5f5f4", border: "#a8a29e", text: "#44403c" },
  OTHER:         { fill: "#f1f5f9", border: "#94a3b8", text: "#334155" },
};
const DEFAULT_COLOR = { fill: "#f1f5f9", border: "#94a3b8", text: "#334155" };

function getNodeColor(id, level) {
  if (level === "department") {
    return DEPT_COLORS[id] || DEFAULT_COLOR;
  }
  // Station level — color by department
  const st = STATIONS[id];
  if (st) return DEPT_COLORS[st.department] || DEFAULT_COLOR;
  const prefix = id.substring(0, 2).toUpperCase();
  const prefixToDept = { CS: "SAW", CE: "EDGE / FOIL", CB: "DRILL", CR: "ROUTER", CD: "DOVETAIL", CF: "FINISH", CA: "ASSEMBLY", CP: "PRESS / MISC", CT: "CUT / PROFILE", CV: "HARDWARE" };
  return DEPT_COLORS[prefixToDept[prefix]] || DEFAULT_COLOR;
}

function getNodeLabel(id, level) {
  if (level === "department") return id;
  const st = STATIONS[id];
  return st ? st.description : id;
}

function getNodeSublabel(id, level) {
  if (level === "department") return DEPARTMENTS[id] || "";
  const st = STATIONS[id];
  return st ? st.id : "";
}

// ─── Edge color ──────────────────────────────────────────────
function edgeColor(ratio) {
  if (ratio >= 0.6) return "#0284c7";
  if (ratio >= 0.35) return "#2563eb";
  if (ratio >= 0.15) return "#6366f1";
  return "#818cf8";
}

// ─── Layout computation ─────────────────────────────────────
function computeLayout(flowLevel, level) {
  const { nodes, edges } = flowLevel;
  if (!nodes || nodes.length === 0) return { laidOutNodes: [], laidOutEdges: [], vbW: 400, vbH: 300 };

  const nodeW = level === "department" ? 130 : 110;

  // Source/target scoring
  const fromCount = {};
  const toCount = {};
  nodes.forEach(n => { fromCount[n.id] = 0; toCount[n.id] = 0; });
  edges.forEach(e => {
    if (fromCount[e.from] !== undefined) fromCount[e.from] += e.count;
    if (toCount[e.to] !== undefined) toCount[e.to] += e.count;
  });

  const scored = nodes.map(n => ({
    ...n,
    score: (fromCount[n.id] || 0) - (toCount[n.id] || 0),
  }));
  scored.sort((a, b) => b.score - a.score);

  // Assign to columns
  const cols = Array.from({ length: NUM_COLS }, () => []);
  const perCol = Math.max(1, Math.ceil(scored.length / NUM_COLS));
  scored.forEach((n, i) => {
    const ci = Math.min(Math.floor(i / perCol), NUM_COLS - 1);
    cols[ci].push(n);
  });
  cols.forEach(col => col.sort((a, b) => b.count - a.count));

  // Position nodes
  const colWidth = nodeW + COL_GAP;
  const maxColLen = Math.max(...cols.map(c => c.length), 1);
  const vbH = Math.max(300, PAD_Y * 2 + maxColLen * (NODE_H + ROW_GAP));
  const vbW = PAD_X * 2 + NUM_COLS * colWidth;

  const nodeMap = {};
  const laidOutNodes = [];
  cols.forEach((col, ci) => {
    const totalH = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const startY = (vbH - totalH) / 2;
    col.forEach((n, ri) => {
      const x = PAD_X + ci * colWidth;
      const y = startY + ri * (NODE_H + ROW_GAP);
      const ln = { ...n, x, y, w: nodeW };
      laidOutNodes.push(ln);
      nodeMap[n.id] = ln;
    });
  });

  // Build edges
  const maxE = Math.max(...edges.map(e => e.count), 1);
  const minShow = maxE * 0.03;
  const laidOutEdges = edges
    .filter(e => e.count >= minShow && nodeMap[e.from] && nodeMap[e.to])
    .map(e => {
      const s = nodeMap[e.from], t = nodeMap[e.to];
      const sx = s.x + s.w, sy = s.y + NODE_H / 2;
      const tx = t.x, ty = t.y + NODE_H / 2;
      let dx = Math.abs(tx - sx);
      // Handle reverse edges
      let startX = sx, startY = sy, endX = tx, endY = ty;
      if (tx <= sx) {
        startX = s.x + s.w / 2;
        startY = s.y + NODE_H;
        endX = t.x + t.w / 2;
        endY = t.y;
        dx = Math.abs(endX - startX) + 60;
      }
      const tension = dx < 80 ? 0.7 : 0.42;
      const c1x = f(startX + dx * tension), c1y = f(startY);
      const c2x = f(endX - dx * tension), c2y = f(endY);
      const d = `M${f(startX)},${f(startY)} C${c1x},${c1y} ${c2x},${c2y} ${f(endX)},${f(endY)}`;
      const B = (a, b, c, dd) => a * 0.125 + b * 0.375 + c * 0.375 + dd * 0.125;
      const mx = Math.round(B(startX, +c1x, +c2x, endX));
      const my = Math.round(B(startY, +c1y, +c2y, endY));
      const ratio = e.count / maxE;
      const strokeW = Math.max(1.5, ratio * 10);
      return { ...e, d, mx, my, ratio, strokeW };
    });

  return { laidOutNodes, laidOutEdges, vbW, vbH, nodeW, maxEdge: maxE };
}

// ─── Main component ────────────────────────────────────────
export default function DataFlowMap() {
  const [selectedClass, setSelectedClass] = useState("ALL PRODUCTS");
  const [level, setLevel] = useState("department"); // "department" | "station"
  const [hovNode, setHovNode] = useState(null);
  const [hovEdge, setHovEdge] = useState(null);
  const [deptFilter, setDeptFilter] = useState(null); // filter station view to dept

  const classNames = useMemo(() =>
    Object.keys(FLOW_DATA).sort((a, b) => {
      if (a === "ALL PRODUCTS") return -1;
      if (b === "ALL PRODUCTS") return 1;
      return a.localeCompare(b);
    }), []);

  const classData = FLOW_DATA[selectedClass];
  const flowLevel = classData ? classData[level] : null;

  // If filtering stations by department, filter the data
  const filteredFlow = useMemo(() => {
    if (!flowLevel) return null;
    if (level !== "station" || !deptFilter) return flowLevel;

    const deptStations = new Set(
      Object.values(STATIONS)
        .filter(s => s.department === deptFilter)
        .map(s => s.id)
    );
    return {
      nodes: flowLevel.nodes.filter(n => deptStations.has(n.id)),
      edges: flowLevel.edges.filter(e => deptStations.has(e.from) || deptStations.has(e.to)),
    };
  }, [flowLevel, level, deptFilter]);

  const layout = useMemo(() => {
    if (!filteredFlow) return { laidOutNodes: [], laidOutEdges: [], vbW: 400, vbH: 300, nodeW: 110, maxEdge: 1 };
    return computeLayout(filteredFlow, level);
  }, [filteredFlow, level]);

  const { laidOutNodes, laidOutEdges, vbW, vbH, nodeW = 110, maxEdge } = layout;

  const isConn = (nid, e) => e.from === nid || e.to === nid;
  const eOpacity = (e, i) => {
    if (!hovNode && hovEdge == null) return 1;
    if (hovEdge === i || (hovNode && isConn(hovNode, e))) return 1;
    return 0.06;
  };

  const handleDeptClick = (deptId) => {
    if (level === "department") {
      // Drill down to station level, filtered by this department
      setLevel("station");
      setDeptFilter(deptId);
      setHovNode(null);
      setHovEdge(null);
    }
  };

  const handleBreadcrumb = (target) => {
    if (target === "department") {
      setLevel("department");
      setDeptFilter(null);
    } else if (target === "station") {
      setDeptFilter(null);
    }
    setHovNode(null);
    setHovEdge(null);
  };

  const font = "'DM Mono', 'Courier New', monospace";

  return (
    <div style={{
      background: "#f8fafc", padding: "20px 14px 14px",
      fontFamily: font,
    }}>
      {/* ── Header ── */}
      <div style={{ marginBottom: 12, borderBottom: "1px solid #cbd5e1", paddingBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ color: "#0284c7", fontSize: 11, letterSpacing: 3, fontWeight: 700 }}>
            KINETIC VISION
          </span>
          <span style={{ color: "#94a3b8", fontSize: 11 }}>|</span>
          <span style={{ color: "#1e293b", fontSize: 15, fontWeight: 700 }}>
            Data-Driven Routing Flow
          </span>
          <span style={{ color: "#94a3b8", fontSize: 11 }}>|</span>
          <span style={{ color: "#64748b", fontSize: 10, textTransform: "uppercase", letterSpacing: 1 }}>
            {level === "department" ? "Department View" : deptFilter ? `Station View — ${deptFilter}` : "All Stations View"}
          </span>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Product class dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>PRODUCT CLASS:</label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setHovNode(null); setHovEdge(null); }}
              style={{
                background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4,
                padding: "4px 8px", fontSize: 11, fontFamily: font, color: "#1e293b",
                cursor: "pointer",
              }}
            >
              {classNames.map(c => (
                <option key={c} value={c}>
                  {c} ({FLOW_DATA[c].totalParts} parts)
                </option>
              ))}
            </select>
          </div>

          {/* Level toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1, marginRight: 4 }}>VIEW:</label>
            {["department", "station"].map(l => (
              <button key={l} onClick={() => { setLevel(l); if (l === "department") setDeptFilter(null); setHovNode(null); setHovEdge(null); }}
                style={{
                  padding: "3px 10px", fontSize: 10, fontFamily: font, cursor: "pointer",
                  borderRadius: 3, border: level === l ? "1px solid #0284c7" : "1px solid #cbd5e1",
                  background: level === l ? "#0284c7" : "#fff",
                  color: level === l ? "#fff" : "#475569",
                  fontWeight: level === l ? 700 : 400,
                }}>
                {l === "department" ? "DEPARTMENT" : "STATION"}
              </button>
            ))}
          </div>

          {/* Department filter (when in station view) */}
          {level === "station" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>DEPT FILTER:</label>
              <select
                value={deptFilter || ""}
                onChange={e => { setDeptFilter(e.target.value || null); setHovNode(null); setHovEdge(null); }}
                style={{
                  background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4,
                  padding: "4px 8px", fontSize: 11, fontFamily: font, color: "#1e293b",
                  cursor: "pointer",
                }}
              >
                <option value="">All Departments</option>
                {Object.keys(DEPARTMENTS).sort().map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        <div style={{ marginTop: 6, display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
          <span onClick={() => handleBreadcrumb("department")}
            style={{ color: "#0284c7", cursor: "pointer", textDecoration: "underline" }}>
            Departments
          </span>
          {level === "station" && (
            <>
              <span style={{ color: "#94a3b8" }}>&gt;</span>
              <span onClick={() => handleBreadcrumb("station")}
                style={{ color: deptFilter ? "#0284c7" : "#1e293b", cursor: deptFilter ? "pointer" : "default",
                  textDecoration: deptFilter ? "underline" : "none", fontWeight: deptFilter ? 400 : 700 }}>
                Stations
              </span>
              {deptFilter && (
                <>
                  <span style={{ color: "#94a3b8" }}>&gt;</span>
                  <span style={{ color: "#1e293b", fontWeight: 700 }}>{deptFilter}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── SVG Canvas ── */}
      <div style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${vbW} ${vbH}`} style={{ display: "block", width: "100%", height: "auto", minHeight: 300 }}>
          <defs>
            <marker id="dfm-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8" />
            </marker>
            <marker id="dfm-arrH" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#0284c7" />
            </marker>
            <filter id="dfm-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          <rect width={vbW} height={vbH} fill="#ffffff" />

          {/* Grid */}
          {[...Array(Math.floor(vbW / 70))].map((_, i) => (
            <line key={"gx" + i} x1={(i + 1) * 70} y1={0} x2={(i + 1) * 70} y2={vbH} stroke="#f1f5f9" strokeWidth={1} />
          ))}
          {[...Array(Math.floor(vbH / 70))].map((_, i) => (
            <line key={"gy" + i} x1={0} y1={(i + 1) * 70} x2={vbW} y2={(i + 1) * 70} stroke="#f1f5f9" strokeWidth={1} />
          ))}

          {/* Edges */}
          {laidOutEdges.map((e, i) => {
            const op = eOpacity(e, i);
            const hi = hovEdge === i || (hovNode && isConn(hovNode, e));
            const clr = hi ? "#0284c7" : edgeColor(e.ratio);
            const showLbl = e.ratio >= 0.2 || hi;

            return (
              <g key={i}>
                <path d={e.d} fill="none" stroke="transparent" strokeWidth={Math.max(e.strokeW + 10, 14)}
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHovEdge(i)} onMouseLeave={() => setHovEdge(null)} />
                {hi && <path d={e.d} fill="none" stroke="#0284c7" strokeWidth={e.strokeW + 4} opacity={0.15} style={{ pointerEvents: "none" }} />}
                <path d={e.d} fill="none" stroke={clr} strokeWidth={e.strokeW} opacity={op}
                  markerEnd={`url(#${hi ? "dfm-arrH" : "dfm-arr"})`}
                  style={{ pointerEvents: "none", transition: "opacity 0.12s" }} />
                {showLbl && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect x={e.mx - 16} y={e.my - 9} width={32} height={14} rx={2}
                      fill="#fff" fillOpacity={0.95} stroke={hi ? "#0284c7" : "#cbd5e1"} strokeWidth={0.5} />
                    <text x={e.mx} y={e.my + 4} textAnchor="middle" fontSize={8}
                      fontWeight={700} fill={hi ? "#0284c7" : "#334155"} fontFamily={font}>
                      {e.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Nodes */}
          {laidOutNodes.map(n => {
            const isH = hovNode === n.id;
            const isC = hovNode && hovNode !== n.id && laidOutEdges.some(e => isConn(hovNode, e) && isConn(n.id, e));
            const dim = hovNode && !isH && !isC;
            const clr = getNodeColor(n.id, level);
            const label = getNodeLabel(n.id, level);
            const sublabel = getNodeSublabel(n.id, level);
            const canDrill = level === "department";

            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}
                style={{ cursor: canDrill ? "pointer" : "default" }}
                onMouseEnter={() => setHovNode(n.id)}
                onMouseLeave={() => setHovNode(null)}
                onClick={() => canDrill && handleDeptClick(n.id)}>

                {(isH || isC) && (
                  <rect width={n.w} height={NODE_H} rx={NODE_R}
                    fill={isH ? "#0284c7" : clr.border} opacity={0.12} filter="url(#dfm-glow)" />
                )}

                <rect width={n.w} height={NODE_H} rx={NODE_R}
                  fill={clr.fill}
                  stroke={isH ? "#0284c7" : isC ? clr.border : "#cbd5e1"}
                  strokeWidth={isH ? 2 : 1}
                  opacity={dim ? 0.15 : 1}
                  style={{ transition: "opacity 0.12s" }} />

                {!dim && (
                  <rect width={n.w} height={2.5} rx={NODE_R} fill={clr.border} opacity={isH ? 1 : 0.6} />
                )}

                <text x={n.w / 2} y={sublabel ? 16 : NODE_H / 2 + 4}
                  textAnchor="middle" fontSize={level === "department" ? 11 : 9.5} fontWeight={700}
                  fill={dim ? "#94a3b8" : clr.text} fontFamily={font}
                  style={{ transition: "fill 0.12s" }}>
                  {label.length > 16 ? label.slice(0, 15) + "…" : label}
                </text>

                {sublabel && (
                  <text x={n.w / 2} y={29} textAnchor="middle" fontSize={8}
                    fill={dim ? "#94a3b8" : clr.text} opacity={dim ? 0.5 : 0.6} fontFamily={font}>
                    {sublabel}
                  </text>
                )}

                <text x={n.w / 2} y={NODE_H - 4} textAnchor="middle" fontSize={7.5}
                  fill={dim ? "#cbd5e1" : "#64748b"} fontFamily={font}>
                  {n.count.toLocaleString()} ops
                </text>

                {canDrill && isH && (
                  <text x={n.w / 2} y={NODE_H + 12} textAnchor="middle" fontSize={7}
                    fill="#0284c7" fontWeight={700} fontFamily={font}>
                    CLICK TO DRILL DOWN
                  </text>
                )}
              </g>
            );
          })}

          {/* Edge tooltip */}
          {hovEdge !== null && laidOutEdges[hovEdge] && (() => {
            const e = laidOutEdges[hovEdge];
            const fromLbl = getNodeLabel(e.from, level);
            const toLbl = getNodeLabel(e.to, level);
            const txt = `${fromLbl} → ${toLbl}: ${e.count}`;
            const tW = Math.max(txt.length * 6.5, 160);
            const tH = 24;
            const tipX = Math.min(Math.max(e.mx - tW / 2, 4), vbW - tW - 4);
            const tipY = e.my > 50 ? e.my - 34 : e.my + 12;
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={tipX} y={tipY} width={tW} height={tH} rx={3}
                  fill="#fff" stroke="#0284c7" strokeWidth={1} />
                <text x={tipX + tW / 2} y={tipY + 16} textAnchor="middle"
                  fontSize={9} fill="#1e293b" fontFamily={font}>{txt}</text>
              </g>
            );
          })()}

          {/* Node hover panel */}
          {hovNode && (() => {
            const n = laidOutNodes.find(x => x.id === hovNode);
            if (!n) return null;
            const inE = laidOutEdges.filter(e => e.to === hovNode);
            const outE = laidOutEdges.filter(e => e.from === hovNode);
            const inTotal = inE.reduce((a, e) => a + e.count, 0);
            const outTotal = outE.reduce((a, e) => a + e.count, 0);
            const pW = 260, pH = 70;
            const pX = 8, pY = vbH - pH - 8;
            return (
              <g style={{ pointerEvents: "none" }}>
                <rect x={pX} y={pY} width={pW} height={pH} rx={4}
                  fill="#fff" stroke="#0284c7" strokeWidth={1} opacity={0.97} />
                <text x={pX + 10} y={pY + 16} fontSize={10} fontWeight={700}
                  fill="#0284c7" fontFamily={font}>
                  {getNodeLabel(hovNode, level).toUpperCase()}
                </text>
                <text x={pX + 10} y={pY + 30} fontSize={8.5}
                  fill="#64748b" fontFamily={font}>
                  {getNodeSublabel(hovNode, level)} — {n.count.toLocaleString()} operations
                </text>
                <text x={pX + 10} y={pY + 44} fontSize={9} fill="#334155" fontFamily={font}>
                  ↑ {inE.length} in ({inTotal.toLocaleString()}) &nbsp; ↓ {outE.length} out ({outTotal.toLocaleString()})
                </text>
                {level === "department" && (
                  <text x={pX + 10} y={pY + 58} fontSize={8} fill="#0284c7" fontWeight={700} fontFamily={font}>
                    Click to see stations in this department
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Stats bar ── */}
      <div style={{ display: "flex", gap: 20, marginTop: 10, flexWrap: "wrap", alignItems: "center",
        borderTop: "1px solid #cbd5e1", paddingTop: 8 }}>
        <span style={{ color: "#1e293b", fontSize: 10, fontWeight: 700, fontFamily: font }}>
          {selectedClass}
        </span>
        <span style={{ color: "#64748b", fontSize: 10, fontFamily: font }}>
          {classData?.totalParts.toLocaleString()} parts
        </span>
        <span style={{ color: "#94a3b8", fontSize: 10 }}>·</span>
        <span style={{ color: "#64748b", fontSize: 10, fontFamily: font }}>
          {laidOutNodes.length} {level === "department" ? "departments" : "stations"} shown
        </span>
        <span style={{ color: "#94a3b8", fontSize: 10 }}>·</span>
        <span style={{ color: "#64748b", fontSize: 10, fontFamily: font }}>
          {laidOutEdges.length} routing paths
        </span>
        <span style={{ color: "#94a3b8", fontSize: 10, marginLeft: "auto", fontFamily: font }}>
          Data sourced from Casegoods Fab routing data
        </span>
      </div>

      {/* ── Department color legend ── */}
      <div style={{ display: "flex", gap: 10, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, fontFamily: font }}>DEPARTMENTS:</span>
        {Object.entries(DEPT_COLORS).filter(([k]) => k !== "OTHER" && k !== "STAGING").map(([dept, clr]) => (
          <div key={dept} style={{ display: "flex", alignItems: "center", gap: 4, cursor: level === "department" ? "default" : "pointer" }}
            onClick={() => { if (level === "station") { setDeptFilter(deptFilter === dept ? null : dept); } }}>
            <div style={{ width: 10, height: 10, borderRadius: 2, background: clr.fill, border: `1px solid ${clr.border}` }} />
            <span style={{ color: "#475569", fontSize: 8.5, fontFamily: font }}>{dept}</span>
          </div>
        ))}
      </div>

      {/* ── Hint ── */}
      <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 9, letterSpacing: 1, fontFamily: font }}>
        {level === "department"
          ? "CLICK A DEPARTMENT NODE TO DRILL DOWN INTO INDIVIDUAL STATIONS. USE THE DROPDOWN TO FILTER BY PRODUCT CLASS."
          : "USE THE DEPT FILTER TO FOCUS ON A SPECIFIC DEPARTMENT. CLICK 'DEPARTMENT' BREADCRUMB TO GO BACK."}
      </div>
    </div>
  );
}
