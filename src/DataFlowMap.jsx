import { useState, useMemo } from "react";
import { FLOW_DATA, STATIONS, MACHINE_GROUPS, DEPARTMENTS, OPERATIONS, PARTS_BY_CLASS, PART_ROUTES } from "./flowData";

// ─── Layout constants ────────────────────────────────────────
const NODE_H = 44;
const NODE_R = 5;
const PAD_X = 60;
const PAD_Y = 40;
const COL_GAP = 40;
const ROW_GAP = 14;
const NUM_COLS = 6;
const OP_NUM_COLS = 8;
const OP_MAX_NODES = 60;
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
  if (level === "group") {
    const mg = MACHINE_GROUPS[id];
    if (mg) return DEPT_COLORS[mg.department] || DEFAULT_COLOR;
    return DEFAULT_COLOR;
  }
  if (level === "operation") {
    // Parse "STATION::OPDSC" → color by station's department
    const station = id.split("::")[0];
    const st = STATIONS[station];
    if (st) return DEPT_COLORS[st.department] || DEFAULT_COLOR;
    const prefix = station.substring(0, 2).toUpperCase();
    const prefixToDept = { CS: "SAW", CE: "EDGE / FOIL", CB: "DRILL", CR: "ROUTER", CD: "DOVETAIL", CF: "FINISH", CA: "ASSEMBLY", CP: "PRESS / MISC", CT: "CUT / PROFILE", CV: "HARDWARE" };
    return DEPT_COLORS[prefixToDept[prefix]] || DEFAULT_COLOR;
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
  if (level === "group") return id;
  if (level === "operation") {
    // Strip "STATION::" prefix, show just OPDSC
    const parts = id.split("::");
    return parts.length > 1 ? parts[1] : id;
  }
  const st = STATIONS[id];
  return st ? st.description : id;
}

function getNodeSublabel(id, level) {
  if (level === "department") return DEPARTMENTS[id] || "";
  if (level === "group") {
    const mg = MACHINE_GROUPS[id];
    if (mg) return mg.department + " — " + mg.stations.length + " station" + (mg.stations.length !== 1 ? "s" : "");
    return "";
  }
  if (level === "operation") {
    const op = OPERATIONS[id];
    if (op) return op.station + " — " + op.avgRunLabor.toFixed(2) + "h";
    const station = id.split("::")[0];
    return station;
  }
  const st = STATIONS[id];
  return st ? st.id + " — " + st.group : "";
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
  let { nodes, edges } = flowLevel;
  if (!nodes || nodes.length === 0) return { laidOutNodes: [], laidOutEdges: [], vbW: 400, vbH: 300, totalNodes: 0, shownNodes: 0 };

  const isOp = level === "operation";
  const numCols = isOp ? OP_NUM_COLS : NUM_COLS;
  const nodeW = level === "department" ? 130 : level === "group" ? 120 : isOp ? 100 : 110;

  // Cap nodes at operation level
  let totalNodes = nodes.length;
  let shownNodes = totalNodes;
  if (isOp && nodes.length > OP_MAX_NODES) {
    const sorted = [...nodes].sort((a, b) => b.count - a.count);
    nodes = sorted.slice(0, OP_MAX_NODES);
    shownNodes = OP_MAX_NODES;
    // Filter edges to only include visible nodes
    const visibleIds = new Set(nodes.map(n => n.id));
    edges = edges.filter(e => visibleIds.has(e.from) && visibleIds.has(e.to));
  }

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
  const cols = Array.from({ length: numCols }, () => []);
  const perCol = Math.max(1, Math.ceil(scored.length / numCols));
  scored.forEach((n, i) => {
    const ci = Math.min(Math.floor(i / perCol), numCols - 1);
    cols[ci].push(n);
  });
  cols.forEach(col => col.sort((a, b) => b.count - a.count));

  // Position nodes
  const colWidth = nodeW + COL_GAP;
  const maxColLen = Math.max(...cols.map(c => c.length), 1);
  const vbH = Math.max(300, PAD_Y * 2 + maxColLen * (NODE_H + ROW_GAP));
  const vbW = PAD_X * 2 + numCols * colWidth;

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

  return { laidOutNodes, laidOutEdges, vbW, vbH, nodeW, maxEdge: maxE, totalNodes, shownNodes };
}

// ─── Main component ────────────────────────────────────────
export default function DataFlowMap() {
  const [selectedClass, setSelectedClass] = useState("ALL PRODUCTS");
  const [level, setLevel] = useState("department"); // "department" | "group" | "station" | "operation"
  const [hovNode, setHovNode] = useState(null);
  const [hovEdge, setHovEdge] = useState(null);
  const [deptFilter, setDeptFilter] = useState(null);
  const [groupFilter, setGroupFilter] = useState(null);
  const [stationFilter, setStationFilter] = useState(null);
  const [partFilter, setPartFilter] = useState(null);

  const classNames = useMemo(() =>
    Object.keys(FLOW_DATA).sort((a, b) => {
      if (a === "ALL PRODUCTS") return -1;
      if (b === "ALL PRODUCTS") return 1;
      return a.localeCompare(b);
    }), []);

  const classData = FLOW_DATA[selectedClass];

  // Parts available for current class
  const availableParts = useMemo(() => {
    if (selectedClass === "ALL PRODUCTS") {
      // Combine all parts across all classes
      const all = [];
      for (const parts of Object.values(PARTS_BY_CLASS)) {
        all.push(...parts);
      }
      all.sort((a, b) => a.id.localeCompare(b.id));
      return all;
    }
    return PARTS_BY_CLASS[selectedClass] || [];
  }, [selectedClass]);

  // Derive flow data from a single part's routing sequence
  const partFlowLevel = useMemo(() => {
    if (!partFilter || !PART_ROUTES[partFilter]) return null;
    const route = PART_ROUTES[partFilter]; // [[wkctr, opdsc], ...]

    // Build sequence with dept/group info
    const sequence = route.map(([wkctr, opdsc]) => {
      const meta = STATIONS[wkctr] || {};
      const dept = meta.department || ((() => {
        const upper = wkctr.toUpperCase();
        if (upper.endsWith("RIS")) return "STAGING";
        const pfx = upper.substring(0, 2);
        const map = { CS: "SAW", CE: "EDGE / FOIL", CB: "DRILL", CR: "ROUTER", CD: "DOVETAIL", CF: "FINISH", CA: "ASSEMBLY", CP: "PRESS / MISC", CT: "CUT / PROFILE", CV: "HARDWARE" };
        return map[pfx] || "OTHER";
      })());
      const group = meta.group || dept;
      return { wkctr, opdsc, dept, group };
    });

    function buildLevel(keyFn) {
      const nodeSet = new Set();
      const nodeMap = {};
      const edgeMap = {};
      sequence.forEach(s => {
        const k = keyFn(s);
        if (!nodeSet.has(k)) { nodeMap[k] = 1; nodeSet.add(k); }
      });
      for (let i = 0; i < sequence.length - 1; i++) {
        const ak = keyFn(sequence[i]), bk = keyFn(sequence[i + 1]);
        if (ak !== bk) {
          const ek = `${ak}|||${bk}`;
          edgeMap[ek] = (edgeMap[ek] || 0) + 1;
        }
      }
      return {
        nodes: Object.entries(nodeMap).map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count),
        edges: Object.entries(edgeMap).map(([k, count]) => { const [from, to] = k.split("|||"); return { from, to, count }; }).sort((a, b) => b.count - a.count),
      };
    }

    return {
      department: buildLevel(s => s.dept),
      group: buildLevel(s => s.group),
      station: buildLevel(s => s.wkctr),
      operation: buildLevel(s => `${s.wkctr}::${s.opdsc}`),
    };
  }, [partFilter]);

  const flowLevel = partFlowLevel ? partFlowLevel[level] : (classData ? classData[level] : null);

  // Available stations for the station filter dropdown at operation level
  const availableStations = useMemo(() => {
    if (level !== "operation" || !classData || !classData.operation) return [];
    const stSet = new Set();
    classData.operation.nodes.forEach(n => {
      const station = n.id.split("::")[0];
      stSet.add(station);
    });
    return [...stSet].sort();
  }, [level, classData]);

  // Filter data based on dept/group/station filters
  const filteredFlow = useMemo(() => {
    if (!flowLevel) return null;

    if (level === "group" && deptFilter) {
      const deptGroups = new Set(
        Object.values(MACHINE_GROUPS)
          .filter(g => g.department === deptFilter)
          .map(g => g.id)
      );
      return {
        nodes: flowLevel.nodes.filter(n => deptGroups.has(n.id)),
        edges: flowLevel.edges.filter(e => deptGroups.has(e.from) || deptGroups.has(e.to)),
      };
    }

    if (level === "station") {
      let allowedStations = null;
      if (groupFilter) {
        const mg = MACHINE_GROUPS[groupFilter];
        allowedStations = mg ? new Set(mg.stations) : null;
      } else if (deptFilter) {
        allowedStations = new Set(
          Object.values(STATIONS).filter(s => s.department === deptFilter).map(s => s.id)
        );
      }
      if (allowedStations) {
        return {
          nodes: flowLevel.nodes.filter(n => allowedStations.has(n.id)),
          edges: flowLevel.edges.filter(e => allowedStations.has(e.from) || allowedStations.has(e.to)),
        };
      }
    }

    if (level === "operation" && stationFilter) {
      const prefix = stationFilter + "::";
      return {
        nodes: flowLevel.nodes.filter(n => n.id.startsWith(prefix)),
        edges: flowLevel.edges.filter(e => e.from.startsWith(prefix) || e.to.startsWith(prefix)),
      };
    }

    return flowLevel;
  }, [flowLevel, level, deptFilter, groupFilter, stationFilter]);

  const layout = useMemo(() => {
    if (!filteredFlow) return { laidOutNodes: [], laidOutEdges: [], vbW: 400, vbH: 300, nodeW: 110, maxEdge: 1, totalNodes: 0, shownNodes: 0 };
    return computeLayout(filteredFlow, level);
  }, [filteredFlow, level]);

  const { laidOutNodes, laidOutEdges, vbW, vbH, nodeW = 110, maxEdge, totalNodes = 0, shownNodes = 0 } = layout;

  // ── Bottleneck scoring ──
  const bottleneck = useMemo(() => {
    if (!filteredFlow || !filteredFlow.edges.length) return {};
    const scores = {};
    filteredFlow.nodes.forEach(n => {
      const inEdges = filteredFlow.edges.filter(e => e.to === n.id);
      const inVol = inEdges.reduce((a, e) => a + e.count, 0);
      scores[n.id] = inEdges.length * inVol;
    });
    const vals = Object.values(scores);
    const min = Math.min(...vals), max = Math.max(...vals);
    const range = max - min || 1;
    const norm = {};
    Object.keys(scores).forEach(id => { norm[id] = (scores[id] - min) / range; });
    return norm;
  }, [filteredFlow]);

  const bnColor = (score) => {
    if (score == null) return "#cbd5e1";
    if (score <= 0.5) {
      const t = score / 0.5;
      const r = Math.round(22 + t * (234 - 22));
      const g = Math.round(197 + t * (179 - 197));
      const b = Math.round(71 + t * (8 - 71));
      return `rgb(${r},${g},${b})`;
    }
    const t = (score - 0.5) / 0.5;
    const r = Math.round(234 + t * (220 - 234));
    const g = Math.round(179 - t * 179);
    const b = Math.round(8);
    return `rgb(${r},${g},${b})`;
  };
  const bnWidth = (score) => score == null ? 1 : 3 + score * 4;

  const isConn = (nid, e) => e.from === nid || e.to === nid;
  const eOpacity = (e, i) => {
    if (!hovNode && hovEdge == null) return 1;
    if (hovEdge === i || (hovNode && isConn(hovNode, e))) return 1;
    return 0.06;
  };

  const handleNodeClick = (nodeId) => {
    if (level === "department") {
      setLevel("group");
      setDeptFilter(nodeId);
      setGroupFilter(null);
      setStationFilter(null);
      setHovNode(null); setHovEdge(null);
    } else if (level === "group") {
      setLevel("station");
      setGroupFilter(nodeId);
      setStationFilter(null);
      setHovNode(null); setHovEdge(null);
    } else if (level === "station") {
      setLevel("operation");
      setStationFilter(nodeId);
      setHovNode(null); setHovEdge(null);
    }
  };

  const handleBreadcrumb = (target) => {
    if (target === "department") {
      setLevel("department");
      setDeptFilter(null);
      setGroupFilter(null);
      setStationFilter(null);
    } else if (target === "group") {
      setLevel("group");
      setGroupFilter(null);
      setStationFilter(null);
    } else if (target === "station") {
      setLevel("station");
      setStationFilter(null);
    }
    setHovNode(null); setHovEdge(null);
  };

  const canDrill = level !== "operation";

  const stationLabel = stationFilter
    ? (STATIONS[stationFilter] ? STATIONS[stationFilter].description : stationFilter)
    : null;

  const font = "'DM Mono', 'Courier New', monospace";

  // Label truncation length
  const maxLabelLen = level === "operation" ? 14 : 16;
  // Font size for labels
  const labelFontSize = level === "department" ? 11 : level === "operation" ? 8 : 9.5;

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
            {level === "department" ? "Department View"
              : level === "group" ? (deptFilter ? `Machine Groups — ${deptFilter}` : "All Machine Groups")
              : level === "station" ? (groupFilter ? `Stations — ${groupFilter}` : deptFilter ? `Stations — ${deptFilter}` : "All Stations")
              : `Operations — ${stationLabel || "All"}`}
          </span>
        </div>

        {/* Controls row */}
        <div style={{ display: "flex", gap: 16, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
          {/* Product class dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>PRODUCT CLASS:</label>
            <select
              value={selectedClass}
              onChange={e => { setSelectedClass(e.target.value); setPartFilter(null); setHovNode(null); setHovEdge(null); }}
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

          {/* Parts (RTID) filter dropdown */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>PART:</label>
            <select
              value={partFilter || ""}
              onChange={e => { setPartFilter(e.target.value || null); setHovNode(null); setHovEdge(null); }}
              style={{
                background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4,
                padding: "4px 8px", fontSize: 11, fontFamily: font, color: "#1e293b",
                cursor: "pointer", maxWidth: 260,
              }}
            >
              <option value="">All Parts ({availableParts.length})</option>
              {availableParts.map(p => (
                <option key={p.id} value={p.id}>
                  {p.id}{p.desc ? ` — ${p.desc}` : ""}
                </option>
              ))}
            </select>
          </div>

          {/* Level toggle */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1, marginRight: 4 }}>VIEW:</label>
            {[["department", "DEPARTMENT"], ["group", "MACHINE GROUP"], ["station", "STATION"], ["operation", "OPERATION"]].map(([l, lbl]) => (
              <button key={l} onClick={() => {
                setLevel(l);
                if (l === "department") { setDeptFilter(null); setGroupFilter(null); setStationFilter(null); }
                if (l === "group") { setGroupFilter(null); setStationFilter(null); }
                if (l === "station") { setStationFilter(null); }
                setHovNode(null); setHovEdge(null);
              }}
                style={{
                  padding: "3px 10px", fontSize: 10, fontFamily: font, cursor: "pointer",
                  borderRadius: 3, border: level === l ? "1px solid #0284c7" : "1px solid #cbd5e1",
                  background: level === l ? "#0284c7" : "#fff",
                  color: level === l ? "#fff" : "#475569",
                  fontWeight: level === l ? 700 : 400,
                }}>
                {lbl}
              </button>
            ))}
          </div>

          {/* Department filter (group, station & operation views) */}
          {(level === "group" || level === "station") && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>DEPT:</label>
              <select
                value={deptFilter || ""}
                onChange={e => { setDeptFilter(e.target.value || null); setGroupFilter(null); setStationFilter(null); setHovNode(null); setHovEdge(null); }}
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

          {/* Machine group filter (station view) */}
          {level === "station" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>GROUP:</label>
              <select
                value={groupFilter || ""}
                onChange={e => { setGroupFilter(e.target.value || null); setStationFilter(null); setHovNode(null); setHovEdge(null); }}
                style={{
                  background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4,
                  padding: "4px 8px", fontSize: 11, fontFamily: font, color: "#1e293b",
                  cursor: "pointer",
                }}
              >
                <option value="">All Groups</option>
                {Object.keys(MACHINE_GROUPS).sort().map(g => (
                  <option key={g} value={g}>{g} ({MACHINE_GROUPS[g].stations.length})</option>
                ))}
              </select>
            </div>
          )}

          {/* Station filter (operation view) */}
          {level === "operation" && (
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <label style={{ color: "#475569", fontSize: 10, letterSpacing: 1 }}>STATION:</label>
              <select
                value={stationFilter || ""}
                onChange={e => { setStationFilter(e.target.value || null); setHovNode(null); setHovEdge(null); }}
                style={{
                  background: "#fff", border: "1px solid #cbd5e1", borderRadius: 4,
                  padding: "4px 8px", fontSize: 11, fontFamily: font, color: "#1e293b",
                  cursor: "pointer",
                }}
              >
                <option value="">All Stations</option>
                {availableStations.map(s => {
                  const st = STATIONS[s];
                  const label = st ? `${s} — ${st.description}` : s;
                  return <option key={s} value={s}>{label}</option>;
                })}
              </select>
            </div>
          )}
        </div>

        {/* Breadcrumb */}
        <div style={{ marginTop: 6, display: "flex", gap: 4, alignItems: "center", fontSize: 10 }}>
          <span onClick={() => handleBreadcrumb("department")}
            style={{ color: level === "department" ? "#1e293b" : "#0284c7", cursor: level === "department" ? "default" : "pointer",
              textDecoration: level === "department" ? "none" : "underline", fontWeight: level === "department" ? 700 : 400 }}>
            Departments
          </span>
          {(level === "group" || level === "station" || level === "operation") && (
            <>
              <span style={{ color: "#94a3b8" }}>&gt;</span>
              <span onClick={() => handleBreadcrumb("group")}
                style={{ color: level === "group" ? "#1e293b" : "#0284c7", cursor: level === "group" ? "default" : "pointer",
                  textDecoration: level === "group" ? "none" : "underline", fontWeight: level === "group" ? 700 : 400 }}>
                Machine Groups
              </span>
              {deptFilter && level === "group" && (
                <>
                  <span style={{ color: "#94a3b8" }}>&gt;</span>
                  <span style={{ color: "#1e293b", fontWeight: 700 }}>{deptFilter}</span>
                </>
              )}
            </>
          )}
          {(level === "station" || level === "operation") && (
            <>
              <span style={{ color: "#94a3b8" }}>&gt;</span>
              <span onClick={() => handleBreadcrumb("station")}
                style={{ color: level === "station" ? "#1e293b" : "#0284c7", cursor: level === "station" ? "default" : "pointer",
                  textDecoration: level === "station" ? "none" : "underline", fontWeight: level === "station" ? 700 : 400 }}>
                Stations{groupFilter ? ` — ${groupFilter}` : deptFilter ? ` — ${deptFilter}` : ""}
              </span>
            </>
          )}
          {level === "operation" && (
            <>
              <span style={{ color: "#94a3b8" }}>&gt;</span>
              <span style={{ color: "#1e293b", fontWeight: 700 }}>
                Operations{stationLabel ? ` — ${stationLabel}` : ""}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── Node cap indicator ── */}
      {level === "operation" && totalNodes > shownNodes && (
        <div style={{ marginBottom: 6, padding: "4px 10px", background: "#fef3c7", border: "1px solid #f59e0b", borderRadius: 4, fontSize: 10, color: "#78350f", fontFamily: font }}>
          Showing top {shownNodes} of {totalNodes} operations (sorted by routing count)
        </div>
      )}

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

            return (
              <g key={n.id} transform={`translate(${n.x},${n.y})`}
                style={{ cursor: canDrill ? "pointer" : "default" }}
                onMouseEnter={() => setHovNode(n.id)}
                onMouseLeave={() => setHovNode(null)}
                onClick={() => canDrill && handleNodeClick(n.id)}>

                {(isH || isC) && (
                  <rect width={n.w} height={NODE_H} rx={NODE_R}
                    fill={isH ? "#0284c7" : clr.border} opacity={0.12} filter="url(#dfm-glow)" />
                )}

                <rect width={n.w} height={NODE_H} rx={NODE_R}
                  fill={clr.fill}
                  stroke={isH ? "#0284c7" : isC ? clr.border : bnColor(bottleneck[n.id])}
                  strokeWidth={isH ? 2 : bnWidth(bottleneck[n.id])}
                  opacity={dim ? 0.15 : 1}
                  style={{ transition: "opacity 0.12s" }} />

                {!dim && (
                  <rect width={n.w} height={2.5} rx={NODE_R} fill={clr.border} opacity={isH ? 1 : 0.6} />
                )}

                <text x={n.w / 2} y={sublabel ? 16 : NODE_H / 2 + 4}
                  textAnchor="middle" fontSize={labelFontSize} fontWeight={700}
                  fill={dim ? "#94a3b8" : clr.text} fontFamily={font}
                  style={{ transition: "fill 0.12s" }}>
                  {label.length > maxLabelLen ? label.slice(0, maxLabelLen - 1) + "…" : label}
                </text>

                {sublabel && (
                  <text x={n.w / 2} y={29} textAnchor="middle" fontSize={level === "operation" ? 7 : 8}
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
            const pW = 280, pH = 70;
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
                    Click to see machine groups in this department
                  </text>
                )}
                {level === "group" && (
                  <text x={pX + 10} y={pY + 58} fontSize={8} fill="#0284c7" fontWeight={700} fontFamily={font}>
                    Click to see individual stations in this group
                  </text>
                )}
                {level === "station" && (
                  <text x={pX + 10} y={pY + 58} fontSize={8} fill="#0284c7" fontWeight={700} fontFamily={font}>
                    Click to see operations at this station
                  </text>
                )}
              </g>
            );
          })()}
        </svg>
      </div>

      {/* ── Interactive Summary Cards ── */}
      {(() => {
        const src = partFlowLevel || classData;
        const deptCount = src ? src.department.nodes.length : 0;
        const groupCount = src ? src.group.nodes.length : 0;
        const stationCount = src ? src.station.nodes.length : 0;
        const opCount = src && src.operation ? src.operation.nodes.length : 0;
        const deptPaths = src ? src.department.edges.length : 0;
        const groupPaths = src ? src.group.edges.length : 0;
        const stationPaths = src ? src.station.edges.length : 0;
        const opPaths = src && src.operation ? src.operation.edges.length : 0;

        const cards = [
          { label: "DEPARTMENTS", count: deptCount, paths: deptPaths, lvl: "department", active: level === "department" },
          { label: "MACHINE GROUPS", count: groupCount, paths: groupPaths, lvl: "group", active: level === "group" },
          { label: "STATIONS", count: stationCount, paths: stationPaths, lvl: "station", active: level === "station" },
          { label: "OPERATIONS", count: opCount, paths: opPaths, lvl: "operation", active: level === "operation" },
        ];

        return (
          <div style={{ display: "flex", gap: 10, marginTop: 12, flexWrap: "wrap", borderTop: "1px solid #cbd5e1", paddingTop: 10 }}>
            {cards.map(c => (
              <div key={c.lvl} onClick={() => {
                setLevel(c.lvl);
                if (c.lvl === "department") { setDeptFilter(null); setGroupFilter(null); setStationFilter(null); }
                if (c.lvl === "group") { setGroupFilter(null); setStationFilter(null); }
                if (c.lvl === "station") { setStationFilter(null); }
                setHovNode(null); setHovEdge(null);
              }}
                style={{
                  flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 6, cursor: "pointer",
                  background: c.active ? "#0284c7" : "#fff",
                  border: c.active ? "1.5px solid #0284c7" : "1.5px solid #e2e8f0",
                  transition: "all 0.15s",
                }}>
                <div style={{ fontSize: 9, letterSpacing: 1.5, color: c.active ? "#bae6fd" : "#94a3b8", fontFamily: font, marginBottom: 4 }}>
                  {c.label}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 700, color: c.active ? "#fff" : "#1e293b", fontFamily: font }}>
                    {c.count}
                  </span>
                  <span style={{ fontSize: 10, color: c.active ? "#bae6fd" : "#64748b", fontFamily: font }}>
                    nodes
                  </span>
                </div>
                <div style={{ fontSize: 10, color: c.active ? "#e0f2fe" : "#64748b", fontFamily: font, marginTop: 2 }}>
                  {c.paths.toLocaleString()} unique routing paths
                </div>
              </div>
            ))}

            {/* Parts card */}
            <div style={{
              flex: 1, minWidth: 140, padding: "10px 14px", borderRadius: 6,
              background: partFilter ? "#0284c7" : "#f8fafc",
              border: partFilter ? "1.5px solid #0284c7" : "1.5px solid #e2e8f0",
            }}>
              <div style={{ fontSize: 9, letterSpacing: 1.5, color: partFilter ? "#bae6fd" : "#94a3b8", fontFamily: font, marginBottom: 4 }}>
                {partFilter ? "SELECTED PART" : "PRODUCT PARTS"}
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: partFilter ? 16 : 22, fontWeight: 700, color: partFilter ? "#fff" : "#1e293b", fontFamily: font }}>
                  {partFilter || (classData ? classData.totalParts.toLocaleString() : 0)}
                </span>
                {!partFilter && (
                  <span style={{ fontSize: 10, color: "#64748b", fontFamily: font }}>
                    unique RTIDs
                  </span>
                )}
              </div>
              <div style={{ fontSize: 10, color: partFilter ? "#e0f2fe" : "#64748b", fontFamily: font, marginTop: 2 }}>
                {partFilter ? (availableParts.find(p => p.id === partFilter)?.desc || selectedClass) : selectedClass}
              </div>
            </div>
          </div>
        );
      })()}

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

      {/* ── Bottleneck legend ── */}
      <div style={{ display: "flex", gap: 14, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ color: "#475569", fontSize: 9, letterSpacing: 1.5, fontFamily: font }}>BOTTLENECK RISK:</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 3, background: "#f8fafc", border: "3.5px solid #16c547" }} />
          <span style={{ color: "#475569", fontSize: 9, fontFamily: font, fontWeight: 700 }}>LOW</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 3, background: "#f8fafc", border: "4.5px solid #eab308" }} />
          <span style={{ color: "#475569", fontSize: 9, fontFamily: font, fontWeight: 700 }}>MED</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div style={{ width: 18, height: 18, borderRadius: 3, background: "#f8fafc", border: "5.5px solid #dc0008" }} />
          <span style={{ color: "#475569", fontSize: 9, fontFamily: font, fontWeight: 700 }}>HIGH</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: 4 }}>
          <div style={{ width: 50, height: 6, borderRadius: 3, background: "linear-gradient(to right, #16c547, #eab308, #dc0008)" }} />
          <span style={{ color: "#475569", fontSize: 9, fontFamily: font }}>BORDER = CONVERGENCE PRESSURE</span>
        </div>
      </div>

      {/* ── Hint ── */}
      <div style={{ marginTop: 6, color: "#94a3b8", fontSize: 9, letterSpacing: 1, fontFamily: font }}>
        {level === "department"
          ? "CLICK A DEPARTMENT TO SEE ITS MACHINE GROUPS. USE THE DROPDOWN TO FILTER BY PRODUCT CLASS."
          : level === "group"
          ? "CLICK A MACHINE GROUP TO SEE ITS STATIONS. USE BREADCRUMBS TO GO BACK."
          : level === "station"
          ? "CLICK A STATION TO SEE ITS OPERATIONS. USE DEPT OR GROUP FILTERS TO NARROW DOWN."
          : "USE THE STATION FILTER TO FOCUS ON A SINGLE STATION'S OPERATIONS. USE BREADCRUMBS TO GO BACK."}
      </div>
    </div>
  );
}
