import { useState, useMemo } from "react";
import { FLOW_DATA } from "./flowData";

// ─── Layout constants ────────────────────────────────────────
const NODE_W = 100;
const NODE_H = 44;
const NODE_R = 4;
const PAD_X = 60;
const PAD_Y = 40;
const COL_GAP = 40;
const ROW_GAP = 14;
const NUM_COLS = 6;

// ─── Node color palette by prefix ────────────────────────────
const PREFIX_COLORS = {
  CS: { fill: "#dbeafe", border: "#3b82f6", text: "#1e3a5f" },
  CE: { fill: "#d1fae5", border: "#10b981", text: "#064e3b" },
  CB: { fill: "#ede9fe", border: "#8b5cf6", text: "#3b0764" },
  CR: { fill: "#ffedd5", border: "#f97316", text: "#7c2d12" },
  CD: { fill: "#ccfbf1", border: "#14b8a6", text: "#134e4a" },
  CF: { fill: "#fef3c7", border: "#f59e0b", text: "#78350f" },
};
const DEFAULT_COLOR = { fill: "#f1f5f9", border: "#94a3b8", text: "#334155" };

function getNodeColor(id) {
  const prefix = id.substring(0, 2).toUpperCase();
  return PREFIX_COLORS[prefix] || DEFAULT_COLOR;
}

// ─── Edge color by intensity ─────────────────────────────────
function edgeColor(ratio) {
  if (ratio >= 0.6) return "#0284c7";
  if (ratio >= 0.35) return "#2563eb";
  if (ratio >= 0.15) return "#6366f1";
  return "#818cf8";
}

// ─── Layout computation ──────────────────────────────────────
function computeLayout(classData) {
  const { nodes, edges } = classData;
  if (!nodes || nodes.length === 0) return { laidOutNodes: [], laidOutEdges: [], vbW: 400, vbH: 300 };

  // Compute source/target score for each node
  const fromCount = {};
  const toCount = {};
  nodes.forEach((n) => {
    fromCount[n.id] = 0;
    toCount[n.id] = 0;
  });
  edges.forEach((e) => {
    if (fromCount[e.from] !== undefined) fromCount[e.from] += e.count;
    if (toCount[e.to] !== undefined) toCount[e.to] += e.count;
  });

  // score = (from volume) - (to volume); higher = more of a source => left
  const scored = nodes.map((n) => ({
    ...n,
    score: (fromCount[n.id] || 0) - (toCount[n.id] || 0),
  }));

  // Sort by score descending (highest source score first)
  scored.sort((a, b) => b.score - a.score);

  // Assign columns based on quantile of sorted position
  const colAssignment = {};
  const columns = Array.from({ length: NUM_COLS }, () => []);
  const total = scored.length;

  scored.forEach((n, i) => {
    const colIdx = Math.min(Math.floor((i / total) * NUM_COLS), NUM_COLS - 1);
    colAssignment[n.id] = colIdx;
    columns[colIdx].push(n);
  });

  // Within each column, sort by count descending (most used at top)
  columns.forEach((col) => col.sort((a, b) => b.count - a.count));

  // Compute maximum column height for viewBox
  const maxColHeight = Math.max(...columns.map((col) => col.length));
  const vbW = PAD_X * 2 + NUM_COLS * NODE_W + (NUM_COLS - 1) * COL_GAP;
  const vbH = Math.max(300, PAD_Y * 2 + maxColHeight * (NODE_H + ROW_GAP));

  // Assign x/y positions
  const nodePositions = {};
  columns.forEach((col, ci) => {
    const colX = PAD_X + ci * (NODE_W + COL_GAP);
    const colTotalH = col.length * NODE_H + (col.length - 1) * ROW_GAP;
    const startY = Math.max(PAD_Y, (vbH - colTotalH) / 2);

    col.forEach((n, ri) => {
      const x = colX;
      const y = startY + ri * (NODE_H + ROW_GAP);
      nodePositions[n.id] = { x, y, ...n };
    });
  });

  const laidOutNodes = nodes
    .filter((n) => nodePositions[n.id])
    .map((n) => nodePositions[n.id]);

  // Filter edges: only show edges >= 5% of max edge count
  const maxEdgeCount = Math.max(...edges.map((e) => e.count), 1);
  const threshold = maxEdgeCount * 0.05;
  const filteredEdges = edges.filter((e) => e.count >= threshold && nodePositions[e.from] && nodePositions[e.to]);

  // Build edge paths
  const laidOutEdges = filteredEdges.map((e) => {
    const s = nodePositions[e.from];
    const t = nodePositions[e.to];

    // Source right side, target left side
    let sx, sy, tx, ty;

    if (s.x < t.x) {
      // Normal left-to-right
      sx = s.x + NODE_W;
      sy = s.y + NODE_H / 2;
      tx = t.x;
      ty = t.y + NODE_H / 2;
    } else if (s.x > t.x) {
      // Right-to-left (back edge)
      sx = s.x;
      sy = s.y + NODE_H / 2;
      tx = t.x + NODE_W;
      ty = t.y + NODE_H / 2;
    } else {
      // Same column
      sx = s.x + NODE_W / 2;
      sy = s.y + (s.y < t.y ? NODE_H : 0);
      tx = t.x + NODE_W / 2;
      ty = t.y + (s.y < t.y ? 0 : NODE_H);
    }

    const dx = Math.abs(tx - sx);
    const tension = dx < 60 ? 0.65 : 0.4;
    const c1x = sx + (tx - sx) * tension;
    const c1y = sy;
    const c2x = tx - (tx - sx) * tension;
    const c2y = ty;

    const d = `M${sx},${sy} C${c1x},${c1y} ${c2x},${c2y} ${tx},${ty}`;

    // Bezier midpoint at t=0.5
    const mx = Math.round(sx * 0.125 + c1x * 0.375 + c2x * 0.375 + tx * 0.125);
    const my = Math.round(sy * 0.125 + c1y * 0.375 + c2y * 0.375 + ty * 0.125);

    const ratio = e.count / maxEdgeCount;
    const thickness = Math.max(1.5, ratio * 10);
    const showLabel = e.count >= maxEdgeCount * 0.2;

    return {
      d,
      mx,
      my,
      from: e.from,
      to: e.to,
      count: e.count,
      ratio,
      thickness,
      showLabel,
      color: edgeColor(ratio),
    };
  });

  return { laidOutNodes, laidOutEdges, vbW, vbH };
}

// ─── Main component ──────────────────────────────────────────
export default function DataFlowMap() {
  const classNames = useMemo(() => Object.keys(FLOW_DATA), []);
  const [selectedClass, setSelectedClass] = useState("ALL PRODUCTS");
  const [hoveredNode, setHoveredNode] = useState(null);
  const [hoveredEdge, setHoveredEdge] = useState(null);

  const classData = FLOW_DATA[selectedClass];

  const { laidOutNodes, laidOutEdges, vbW, vbH } = useMemo(
    () => computeLayout(classData),
    [classData]
  );

  const isConnected = (nodeId, edge) =>
    edge.from === nodeId || edge.to === nodeId;

  const getEdgeOpacity = (edge, idx) => {
    if (hoveredNode === null && hoveredEdge === null) return 0.7;
    if (hoveredEdge === idx) return 1;
    if (hoveredNode !== null && isConnected(hoveredNode, edge)) return 1;
    return 0.06;
  };

  const getNodeOpacity = (nodeId) => {
    if (hoveredNode === null) return 1;
    if (hoveredNode === nodeId) return 1;
    if (laidOutEdges.some((e) => isConnected(hoveredNode, e) && (e.from === nodeId || e.to === nodeId))) return 1;
    return 0.2;
  };

  return (
    <div
      style={{
        background: "#ffffff",
        minHeight: "100vh",
        padding: "20px 18px 18px",
        fontFamily: "'DM Mono', 'Courier New', monospace",
      }}
    >
      {/* ── Header ── */}
      <div style={{ marginBottom: 14, borderBottom: "1px solid #cbd5e1", paddingBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <span
            style={{
              color: "#0284c7",
              fontSize: 11,
              letterSpacing: 3,
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            DATA FLOW
          </span>
          <span style={{ color: "#94a3b8", fontSize: 11 }}>|</span>
          <span
            style={{
              color: "#1e293b",
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: 0.5,
            }}
          >
            Ashley Furniture — Process Flow Map
          </span>
        </div>

        {/* ── Dropdown ── */}
        <div style={{ marginTop: 10, display: "flex", alignItems: "center", gap: 12 }}>
          <label
            style={{
              color: "#475569",
              fontSize: 10,
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            PRODUCT CLASS:
          </label>
          <select
            value={selectedClass}
            onChange={(e) => {
              setSelectedClass(e.target.value);
              setHoveredNode(null);
              setHoveredEdge(null);
            }}
            style={{
              fontFamily: "'DM Mono', 'Courier New', monospace",
              fontSize: 12,
              padding: "5px 10px",
              border: "1px solid #cbd5e1",
              borderRadius: 4,
              background: "#f8fafc",
              color: "#1e293b",
              cursor: "pointer",
              minWidth: 280,
            }}
          >
            {classNames.map((name) => (
              <option key={name} value={name}>
                {name} ({FLOW_DATA[name].totalParts} parts)
              </option>
            ))}
          </select>
          <span style={{ color: "#64748b", fontSize: 10, letterSpacing: 1 }}>
            HOVER NODES FOR DETAIL
          </span>
        </div>
      </div>

      {/* ── SVG Canvas ── */}
      <div style={{ overflowX: "auto", border: "1px solid #e2e8f0", borderRadius: 6, background: "#ffffff" }}>
        <svg
          viewBox={`0 0 ${vbW} ${vbH}`}
          style={{ display: "block", width: "100%", height: "auto" }}
        >
          <defs>
            <marker id="dfm-arr" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#94a3b8" />
            </marker>
            <marker id="dfm-arrH" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
              <polygon points="0 0, 7 3.5, 0 7" fill="#0284c7" />
            </marker>
            <filter id="dfm-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Background */}
          <rect width={vbW} height={vbH} fill="#ffffff" />

          {/* Subtle grid */}
          {Array.from({ length: Math.floor(vbW / 80) }, (_, i) => (
            <line
              key={"gx" + i}
              x1={(i + 1) * 80}
              y1={0}
              x2={(i + 1) * 80}
              y2={vbH}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
          ))}
          {Array.from({ length: Math.floor(vbH / 80) }, (_, i) => (
            <line
              key={"gy" + i}
              x1={0}
              y1={(i + 1) * 80}
              x2={vbW}
              y2={(i + 1) * 80}
              stroke="#f1f5f9"
              strokeWidth={1}
            />
          ))}

          {/* ── Draw edges (below nodes) ── */}
          {laidOutEdges.map((edge, i) => {
            const op = getEdgeOpacity(edge, i);
            const hi = hoveredEdge === i || (hoveredNode !== null && isConnected(hoveredNode, edge));
            const clr = hi ? "#0284c7" : edge.color;
            const showLbl = edge.showLabel || hi;

            return (
              <g key={"e" + i}>
                {/* Invisible wide hit area */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={Math.max(edge.thickness + 10, 14)}
                  style={{ cursor: "crosshair" }}
                  onMouseEnter={() => setHoveredEdge(i)}
                  onMouseLeave={() => setHoveredEdge(null)}
                />

                {/* Glow layer for highlighted edges */}
                {hi && (
                  <path
                    d={edge.d}
                    fill="none"
                    stroke="#0284c7"
                    strokeWidth={edge.thickness + 4}
                    opacity={0.15}
                    style={{ pointerEvents: "none" }}
                  />
                )}

                {/* Main edge line */}
                <path
                  d={edge.d}
                  fill="none"
                  stroke={clr}
                  strokeWidth={edge.thickness}
                  opacity={op}
                  markerEnd={`url(#${hi ? "dfm-arrH" : "dfm-arr"})`}
                  style={{ pointerEvents: "none", transition: "opacity 0.12s" }}
                />

                {/* Count label */}
                {showLbl && op > 0.1 && (
                  <g style={{ pointerEvents: "none" }}>
                    <rect
                      x={edge.mx - 18}
                      y={edge.my - 9}
                      width={36}
                      height={16}
                      rx={3}
                      fill="#ffffff"
                      fillOpacity={0.95}
                      stroke={hi ? "#0284c7" : "#cbd5e1"}
                      strokeWidth={0.5}
                    />
                    <text
                      x={edge.mx}
                      y={edge.my + 3}
                      textAnchor="middle"
                      fontSize={8}
                      fontWeight={700}
                      fill={hi ? "#0284c7" : "#334155"}
                      fontFamily="'DM Mono', monospace"
                    >
                      {edge.count}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* ── Draw nodes (above edges) ── */}
          {laidOutNodes.map((node) => {
            const colors = getNodeColor(node.id);
            const isH = hoveredNode === node.id;
            const isC =
              hoveredNode !== null &&
              hoveredNode !== node.id &&
              laidOutEdges.some(
                (e) =>
                  (e.from === hoveredNode && e.to === node.id) ||
                  (e.to === hoveredNode && e.from === node.id)
              );
            const nodeOp = getNodeOpacity(node.id);

            return (
              <g
                key={node.id}
                transform={`translate(${node.x},${node.y})`}
                style={{ cursor: "pointer" }}
                onMouseEnter={() => setHoveredNode(node.id)}
                onMouseLeave={() => setHoveredNode(null)}
              >
                {/* Glow backdrop when highlighted */}
                {(isH || isC) && (
                  <rect
                    width={NODE_W}
                    height={NODE_H}
                    rx={NODE_R}
                    fill={isH ? "#0284c7" : colors.border}
                    opacity={0.12}
                    filter="url(#dfm-glow)"
                  />
                )}

                {/* Node body */}
                <rect
                  width={NODE_W}
                  height={NODE_H}
                  rx={NODE_R}
                  fill={colors.fill}
                  stroke={isH ? "#0284c7" : isC ? colors.border : "#cbd5e1"}
                  strokeWidth={isH ? 2 : isC ? 1.5 : 1}
                  opacity={nodeOp}
                  style={{ transition: "opacity 0.12s" }}
                />

                {/* Top accent bar */}
                {nodeOp > 0.5 && (
                  <rect
                    width={NODE_W}
                    height={2}
                    rx={NODE_R}
                    fill={colors.border}
                    opacity={isH ? 1 : 0.6}
                  />
                )}

                {/* Work center ID */}
                <text
                  x={NODE_W / 2}
                  y={17}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={700}
                  fill={nodeOp < 0.5 ? "#94a3b8" : colors.text}
                  fontFamily="'DM Mono', monospace"
                  style={{ transition: "fill 0.12s" }}
                >
                  {node.id}
                </text>

                {/* Part count */}
                <text
                  x={NODE_W / 2}
                  y={34}
                  textAnchor="middle"
                  fontSize={9}
                  fill={nodeOp < 0.5 ? "#94a3b8" : "#64748b"}
                  fontFamily="'DM Mono', monospace"
                  opacity={nodeOp < 0.5 ? 0.5 : 0.8}
                >
                  {node.count} parts
                </text>
              </g>
            );
          })}

          {/* ── Edge hover tooltip ── */}
          {hoveredEdge !== null &&
            hoveredEdge < laidOutEdges.length &&
            (() => {
              const edge = laidOutEdges[hoveredEdge];
              const label = `${edge.from} \u2192 ${edge.to}: ${edge.count}`;
              const tipW = label.length * 7 + 20;
              const tipH = 24;
              const tipX = Math.min(Math.max(edge.mx - tipW / 2, 4), vbW - tipW - 4);
              const tipY = edge.my > 50 ? edge.my - 34 : edge.my + 14;

              return (
                <g style={{ pointerEvents: "none" }}>
                  <rect
                    x={tipX}
                    y={tipY}
                    width={tipW}
                    height={tipH}
                    rx={3}
                    fill="#ffffff"
                    stroke="#0284c7"
                    strokeWidth={1}
                  />
                  <text
                    x={tipX + tipW / 2}
                    y={tipY + 16}
                    textAnchor="middle"
                    fontSize={10}
                    fill="#1e293b"
                    fontFamily="'DM Mono', monospace"
                  >
                    {label}
                  </text>
                </g>
              );
            })()}

          {/* ── Node hover info panel ── */}
          {hoveredNode !== null &&
            (() => {
              const node = laidOutNodes.find((n) => n.id === hoveredNode);
              if (!node) return null;
              const outEdges = laidOutEdges.filter((e) => e.from === hoveredNode);
              const inEdges = laidOutEdges.filter((e) => e.to === hoveredNode);
              const totalIn = inEdges.reduce((a, e) => a + e.count, 0);
              const totalOut = outEdges.reduce((a, e) => a + e.count, 0);
              const panelW = 260;
              const panelH = 70;
              const panelX = 8;
              const panelY = vbH - panelH - 8;

              return (
                <g style={{ pointerEvents: "none" }}>
                  <rect
                    x={panelX}
                    y={panelY}
                    width={panelW}
                    height={panelH}
                    rx={4}
                    fill="#ffffff"
                    stroke="#0284c7"
                    strokeWidth={1}
                    opacity={0.97}
                  />
                  <text
                    x={panelX + 10}
                    y={panelY + 17}
                    fontSize={11}
                    fontWeight={700}
                    fill="#0284c7"
                    fontFamily="'DM Mono', monospace"
                  >
                    {node.id}
                  </text>
                  <text
                    x={panelX + 70}
                    y={panelY + 17}
                    fontSize={10}
                    fill="#64748b"
                    fontFamily="'DM Mono', monospace"
                  >
                    {node.count} parts
                  </text>
                  <text
                    x={panelX + 10}
                    y={panelY + 36}
                    fontSize={9}
                    fill="#334155"
                    fontFamily="'DM Mono', monospace"
                  >
                    {"\u2191"} {inEdges.length} incoming ({totalIn} transitions)
                  </text>
                  <text
                    x={panelX + 10}
                    y={panelY + 52}
                    fontSize={9}
                    fill="#334155"
                    fontFamily="'DM Mono', monospace"
                  >
                    {"\u2193"} {outEdges.length} outgoing ({totalOut} transitions)
                  </text>
                </g>
              );
            })()}
        </svg>
      </div>

      {/* ── Legend ── */}
      <div
        style={{
          display: "flex",
          gap: 16,
          marginTop: 12,
          flexWrap: "wrap",
          alignItems: "center",
          borderTop: "1px solid #e2e8f0",
          paddingTop: 10,
        }}
      >
        <span
          style={{
            color: "#475569",
            fontSize: 9,
            letterSpacing: 1.5,
            fontWeight: 700,
          }}
        >
          NODE PREFIX:
        </span>
        {[
          ["CS", "CS*", "#dbeafe", "#3b82f6"],
          ["CE", "CE*", "#d1fae5", "#10b981"],
          ["CB", "CB*", "#ede9fe", "#8b5cf6"],
          ["CR", "CR*", "#ffedd5", "#f97316"],
          ["CD", "CD*", "#ccfbf1", "#14b8a6"],
          ["CF", "CF*", "#fef3c7", "#f59e0b"],
          ["--", "Other", "#f1f5f9", "#94a3b8"],
        ].map(([key, label, bg, border]) => (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 2,
                background: bg,
                border: `1px solid ${border}`,
              }}
            />
            <span
              style={{
                color: "#475569",
                fontSize: 9,
                letterSpacing: 1,
                fontFamily: "'DM Mono', monospace",
              }}
            >
              {label}
            </span>
          </div>
        ))}

        {/* Edge thickness scale */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              color: "#475569",
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            EDGE WIDTH:
          </span>
          {[
            [0.1, "Low"],
            [0.5, "Med"],
            [1.0, "High"],
          ].map(([ratio, label]) => (
            <div key={label} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <svg width={28} height={12} style={{ display: "block" }}>
                <line
                  x1={0}
                  y1={6}
                  x2={28}
                  y2={6}
                  stroke={edgeColor(ratio)}
                  strokeWidth={Math.max(1.5, ratio * 10)}
                  opacity={0.8}
                />
              </svg>
              <span style={{ color: "#475569", fontSize: 9, fontFamily: "'DM Mono', monospace" }}>
                {label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Info section ── */}
      <div
        style={{
          marginTop: 12,
          padding: "12px 16px",
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
          borderRadius: 6,
          display: "flex",
          gap: 32,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <div>
          <span
            style={{
              color: "#475569",
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            TOTAL PARTS
          </span>
          <div style={{ color: "#1e293b", fontSize: 18, fontWeight: 700 }}>
            {classData.totalParts.toLocaleString()}
          </div>
        </div>
        <div>
          <span
            style={{
              color: "#475569",
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            WORK CENTERS
          </span>
          <div style={{ color: "#1e293b", fontSize: 18, fontWeight: 700 }}>
            {classData.nodes.length}
          </div>
        </div>
        <div>
          <span
            style={{
              color: "#475569",
              fontSize: 9,
              letterSpacing: 1.5,
              fontWeight: 700,
            }}
          >
            TOTAL TRANSITIONS
          </span>
          <div style={{ color: "#1e293b", fontSize: 18, fontWeight: 700 }}>
            {classData.totalTransitions.toLocaleString()}
          </div>
        </div>
        <div style={{ marginLeft: "auto" }}>
          <span
            style={{
              color: "#94a3b8",
              fontSize: 10,
              fontStyle: "italic",
            }}
          >
            Data sourced from Casegoods Fab routing data
          </span>
        </div>
      </div>
    </div>
  );
}
